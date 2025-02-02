import { Repo } from '../../../types/regularTypes'

import BaseQuery from './baseQuery'

/* eslint class-methods-use-this: 0 */
class PullRequestsQuery extends BaseQuery {
  repo: Repo

  constructor(repo: Repo, githubToken: string, perPage: number = 20) {
    const pullRequestsQuery = `{
            repository(owner: "${repo.owner}", name: "${repo.name}") {
              pullRequests(last: ${perPage}, \${beforeCursor}) {
                pageInfo ${BaseQuery.PAGE_SELECT}
                nodes {
                    author {
                        ... on User ${BaseQuery.USER_SELECT}
                    }
                    bodyText
                    state
                    title
                    id
                    url
                    createdAt
                    number
                    additions
                    deletions
                    changedFiles
                    authorAssociation
                    labels(first: 10) {
                      nodes {
                        name
                      }
                    }
                    timelineItems(
                      first: 100
                      itemTypes: [PULL_REQUEST_REVIEW, MERGED_EVENT, ASSIGNED_EVENT, REVIEW_REQUESTED_EVENT, CLOSED_EVENT]
                    ) {
                      nodes {
                        ... on ReviewRequestedEvent {
                          __typename
                          id
                          createdAt
                          actor {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                          requestedReviewer {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                        }
                        ... on PullRequestReview {
                          __typename
                          id
                          state
                          submittedAt
                          body
                          author {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                        }
                        ... on AssignedEvent {
                          __typename
                          id
                          assignee {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                          actor {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                          createdAt
                        }
                        ... on MergedEvent {
                          __typename
                          id
                          createdAt
                          actor {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                          createdAt
                        }
                        ... on ClosedEvent{
                          __typename
                          id
                          actor {
                            ... on User ${BaseQuery.USER_SELECT}
                          }
                          createdAt
                        }
                      }
                    }
                }
              }
            }
          }`

    super(githubToken, pullRequestsQuery, 'pullRequests', perPage)

    this.repo = repo
  }

  getEventData(result) {
    return { ...super.getEventData(result), data: result.repository?.pullRequests?.nodes }
  }
}

export default PullRequestsQuery
