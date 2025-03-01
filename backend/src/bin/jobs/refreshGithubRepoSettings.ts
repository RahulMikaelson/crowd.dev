/* eslint-disable no-continue */
import cronGenerator from 'cron-time-generator'

import { timeout } from '@crowd/common'
import { getServiceChildLogger } from '@crowd/logging'

import { GITHUB_CONFIG } from '../../conf'
import GithubReposRepository from '../../database/repositories/githubReposRepository'
import SequelizeRepository from '../../database/repositories/sequelizeRepository'
import GithubIntegrationService from '../../services/githubIntegrationService'
import IntegrationService from '../../services/integrationService'
import { CrowdJob } from '../../types/jobTypes'

const IS_GITHUB_SNOWFLAKE_ENABLED = GITHUB_CONFIG.isSnowflakeEnabled === 'true'

const log = getServiceChildLogger('refreshGithubRepoSettings')

interface Integration {
  id: string
  tenantId: string
  segmentId: string
  integrationIdentifier: string
  settings: {
    orgs: Array<{
      name: string
      logo: string
      url: string
      fullSync: boolean
      updatedAt: string
      repos: Array<{
        name: string
        url: string
        updatedAt: string
      }>
    }>
  }
}

const refreshForSnowflake = async () => {
  const dbOptions = await SequelizeRepository.getDefaultIRepositoryOptions()

  const githubIntegrations = await dbOptions.database.sequelize.query(
    `SELECT id, "tenantId", settings, "segmentId" FROM integrations 
       WHERE platform = 'github' AND "deletedAt" IS NULL
       AND "createdAt" < NOW() - INTERVAL '1 day'`,
  )

  for (const integration of githubIntegrations[0] as Integration[]) {
    log.info(`Updating repo settings for Github integration: ${integration.id}`)

    try {
      const options = await SequelizeRepository.getDefaultIRepositoryOptions()
      options.currentTenant = { id: integration.tenantId }
      options.currentSegments = [
        // @ts-ignore
        {
          id: integration.segmentId,
        },
      ]

      const integrationService = new IntegrationService(options)

      if (!integration.settings.orgs) {
        log.info(`No orgs found for Github integration: ${integration.id}`)
        continue
      }

      // Get all orgs with fullSync enabled
      const fullSyncOrgs = integration.settings.orgs.filter((org) => org.fullSync)
      const currentRepos = new Set(
        integration.settings.orgs.flatMap((org) => org.repos.map((r) => r.url)),
      )
      const newRepoMappings: Record<string, string> = {}

      // Fetch new repos for each org
      for (const org of fullSyncOrgs) {
        log.info(`Fetching repos for org ${org.name} with fullSync enabled`)
        const githubRepos = await GithubIntegrationService.getOrgRepos(org.name)

        // Find new repos that aren't in current settings
        const newRepos = githubRepos.filter((repo) => !currentRepos.has(repo.url))

        // Map new repos to the integration's segment
        newRepos.forEach((repo) => {
          newRepoMappings[repo.url] = integration.segmentId
        })

        // Update org's repos list directly in the integration settings
        const orgIndex = integration.settings.orgs.findIndex((o) => o.name === org.name)
        if (orgIndex !== -1) {
          integration.settings.orgs[orgIndex].repos = [
            ...integration.settings.orgs[orgIndex].repos,
            ...newRepos.map((repo) => ({
              name: repo.name,
              url: repo.url,
              updatedAt: new Date().toISOString(),
            })),
          ]
          integration.settings.orgs[orgIndex].updatedAt = new Date().toISOString()
        }
      }

      if (Object.keys(newRepoMappings).length > 0) {
        log.info(`Found ${Object.keys(newRepoMappings).length} new repos to add`)

        // Update integration with modified settings object
        await integrationService.update(integration.id, {
          settings: integration.settings,
          status: 'in-progress',
        })

        const currentMapping: {
          url: string
          segment: {
            id: string
            name: string
          }
        }[] = await GithubReposRepository.getMapping(integration.id, options)

        const newFullMapping: Record<string, string> = {
          ...currentMapping.reduce((acc, item) => {
            acc[item.url] = item.segment.id
            return acc
          }, {}),
          ...newRepoMappings,
        }

        // Map new repos
        await integrationService.mapGithubReposSnowflake(
          integration.id,
          newFullMapping,
          true,
          // this will fire onboarding only for new repos
          true,
        )

        log.info(`Successfully mapped ${Object.keys(newRepoMappings).length} new repos`)
      }

      log.info(`Successfully updated repo settings for Github integration: ${integration.id}`)
    } catch (err) {
      log.error(
        `Error updating repo settings for Github integration ${integration.id}: ${err.message}`,
      )
      // that's probably a rate limit error, let's sleep for a minute
      await timeout(60000)
    } finally {
      await timeout(10000)
    }
  }

  log.info('Finished updating Github repo settings.')
}

const refreshForGitHub = async () => {
  log.info('Updating Github repo settings.')
  const dbOptions = await SequelizeRepository.getDefaultIRepositoryOptions()

  interface Integration {
    id: string
    tenantId: string
    integrationIdentifier: string
  }

  const githubIntegrations = await dbOptions.database.sequelize.query(
    `SELECT id, "tenantId", "integrationIdentifier" FROM integrations 
       WHERE platform = 'github' AND "deletedAt" IS NULL
       AND "createdAt" < NOW() - INTERVAL '1 minute' AND "integrationIdentifier" IS NOT NULL`,
  )

  for (const integration of githubIntegrations[0] as Integration[]) {
    log.info(`Updating repo settings for Github integration: ${integration.id}`)

    try {
      const options = await SequelizeRepository.getDefaultIRepositoryOptions()
      options.currentTenant = { id: integration.tenantId }

      const integrationService = new IntegrationService(options)
      // newly discovered repos will be mapped to default segment of the integration
      await integrationService.updateGithubIntegrationSettings(integration.integrationIdentifier)

      log.info(`Successfully updated repo settings for Github integration: ${integration.id}`)
    } catch (err) {
      log.error(
        `Error updating repo settings for Github integration ${integration.id}: ${err.message}`,
      )
    } finally {
      await timeout(1000)
    }
  }

  log.info('Finished updating Github repo settings.')
}

export const refreshGithubRepoSettings = async () => {
  log.info('Updating Github repo settings.')

  if (IS_GITHUB_SNOWFLAKE_ENABLED) {
    await refreshForSnowflake()
  } else {
    await refreshForGitHub()
  }
}

const job: CrowdJob = {
  name: 'Refresh Github repo settings',
  // every day
  cronTime: cronGenerator.every(1).days(),
  onTrigger: async () => {
    await refreshGithubRepoSettings()
  },
}

export default job
