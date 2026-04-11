import { BaseService } from '@/lib/base-service.js'
import { ERR_SCORE_PASSBACK } from '../errors.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LineItemRecord, LtiMutations, LtiQueries } from '../repository/index.js'
import type { AccessTokenManager } from './access-tokens.js'

export class LtiScorePassbackService extends BaseService {
  private queries: LtiQueries
  private mutations: LtiMutations
  private accessTokenManager: AccessTokenManager

  constructor(deps: {
    logger: CoreLogger
    queries: LtiQueries
    mutations: LtiMutations
    accessTokenManager: AccessTokenManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.accessTokenManager = deps.accessTokenManager
  }

  async submitAllScores(userId: string, activityId: string, score: number): Promise<void> {
    const lineItems = await this.queries.getLineItems(userId, activityId)
    for (const lineItem of lineItems) {
      if (lineItem.submitted_progress >= score) {
        continue
      }

      try {
        await this.submitScore(lineItem, score)
      } catch (error) {
        this.logger.error(`Failed to submit score for line item ${lineItem.id}:`, error)
      }
    }
  }

  async submitScore(lineitem: LineItemRecord, score: number): Promise<void> {
    const platform = await this.queries.findPlatformByIssuer(lineitem.platform_issuer)
    if (!platform) {
      throw ERR_SCORE_PASSBACK({ message: `Platform ${lineitem.platform_issuer} not found` })
    }

    const token = await this.accessTokenManager.getAccessToken(platform)

    const headers = new Headers()
    headers.append('Authorization', `Bearer ${token.token}`)
    headers.append('Content-Type', 'application/x-www-form-urlencoded')

    const body = new URLSearchParams({
      userId: lineitem.lti_user_id,
      activityProgress: 'InProgress', // TODO: Is this appropriate?  Should we ever send 'Completed' instead?
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
      scoreGiven: score.toString(),
      scoreMaximum: '1',
    })

    const response = await fetch(`${lineitem.lineitem_url}/scores`, {
      method: 'POST',
      headers,
      body,
    })

    if (response.ok) {
      await this.mutations.updateLineItem(lineitem.id, {
        submitted_progress: score,
      })
    } else {
      throw ERR_SCORE_PASSBACK({ message: `Failed to submit score to ${lineitem.platform_issuer}` })
    }
  }
}
