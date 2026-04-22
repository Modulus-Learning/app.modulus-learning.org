import { BaseService, method } from '@/lib/base-service.js'
import { ERR_SCORE_PASSBACK } from '../errors.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiMutations, LtiQueries, PendingSubmission } from '../repository/index.js'
import type { AccessTokenManager } from './access-tokens.js'

export type ProcessSubmissionResult =
  | { status: 'none_pending' }
  | { status: 'claimed_by_other' }
  | { status: 'success'; lineitemId: string; progress: number }
  | { status: 'failure'; lineitemId: string; error: string }

/**
 * Processes pending LTI score submissions one at a time.
 *
 * Each call to `processOne()` finds the next eligible line item, claims it,
 * attempts to submit the score to the LTI platform (e.g. Canvas), and updates
 * the line item's submission state accordingly.
 *
 * This service is designed to be called in a polling loop by a host process
 * (e.g. from Next.js instrumentation.ts or a standalone worker script).
 */
export class ScoreSubmissionProcessor extends BaseService {
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

  /**
   * Attempts to find and process one pending score submission.
   *
   * Returns a result indicating what happened:
   * - `none_pending`: No eligible line items found
   * - `claimed_by_other`: Found an item but another worker claimed it first
   * - `success`: Score was submitted and line item was updated
   * - `failure`: Score submission failed; line item was marked for retry
   */
  @method
  async processOne(): Promise<ProcessSubmissionResult> {
    const pending = await this.queries.findNextPendingSubmission()
    if (pending == null) {
      return { status: 'none_pending' }
    }

    const claimed = await this.mutations.claimLineItemForSubmission(pending.lineitem_id)
    if (!claimed) {
      return { status: 'claimed_by_other' }
    }

    try {
      await this.submitScore(pending)

      await this.mutations.markSubmissionSuccess(
        pending.lineitem_id,
        pending.current_progress
      )

      this.logger.info(
        {
          lineitem_id: pending.lineitem_id,
          platform_issuer: pending.platform_issuer,
          progress: pending.current_progress,
        },
        'score submitted successfully'
      )

      return {
        status: 'success',
        lineitemId: pending.lineitem_id,
        progress: pending.current_progress,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error'

      this.logger.error(
        {
          lineitem_id: pending.lineitem_id,
          platform_issuer: pending.platform_issuer,
          err: error,
        },
        'score submission failed'
      )

      await this.mutations.markSubmissionFailure(
        pending.lineitem_id,
        errorMessage
      )

      return {
        status: 'failure',
        lineitemId: pending.lineitem_id,
        error: errorMessage,
      }
    }
  }

  private async submitScore(pending: PendingSubmission): Promise<void> {
    const platform = await this.queries.findPlatformByIssuer(pending.platform_issuer)
    if (!platform) {
      throw ERR_SCORE_PASSBACK({
        message: `Platform ${pending.platform_issuer} not found`,
      })
    }

    const token = await this.accessTokenManager.getAccessToken(platform)

    const headers = new Headers()
    headers.append('Authorization', `Bearer ${token.token}`)
    headers.append('Content-Type', 'application/x-www-form-urlencoded')

    const body = new URLSearchParams({
      userId: pending.lti_user_id,
      activityProgress: 'InProgress',
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
      scoreGiven: pending.current_progress.toString(),
      scoreMaximum: '1',
    })

    const response = await fetch(`${pending.lineitem_url}/scores`, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      throw ERR_SCORE_PASSBACK({
        message: `Failed to submit score to ${pending.platform_issuer}: HTTP ${response.status}`,
      })
    }
  }
}
