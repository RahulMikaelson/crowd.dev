import { DB_CONFIG, REDIS_CONFIG } from '@/conf'
import { InitService } from '@/service/init.service'
import { MemberSyncService } from '@/service/member.sync.service'
import { OpenSearchService } from '@/service/opensearch.service'
import { DbStore, getDbConnection } from '@crowd/database'
import { getServiceLogger } from '@crowd/logging'
import { getRedisClient } from '@crowd/redis'

const log = getServiceLogger()

setImmediate(async () => {
  const openSearchService = new OpenSearchService(log)
  await openSearchService.initialize()

  const redis = await getRedisClient(REDIS_CONFIG(), true)

  const dbConnection = getDbConnection(DB_CONFIG())
  const store = new DbStore(log, dbConnection)

  const service = new MemberSyncService(redis, store, openSearchService, log)

  const pageSize = 100
  let results = await service.getAllIndexedTenantIds(pageSize)

  while (results.data.length > 0) {
    for (const id of results.data) {
      if (id !== InitService.FAKE_TENANT_ID) {
        await service.cleanupMemberIndex(id)
      }
    }
    if (results.afterKey) {
      results = await service.getAllIndexedTenantIds(pageSize, results.afterKey)
    } else {
      results = { data: [] }
    }
  }

  process.exit(0)
})
