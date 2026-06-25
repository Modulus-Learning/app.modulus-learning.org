import { BaseService, method } from '@/lib/base-service.js'
import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type { ClaimedLineItem, LtiScoreSubmissionMutations, PlatformRecord } from './repository.js'
import type { SubmissionResult } from './types.js'

/**
 * The result of a single `processOne` call, reported back to the driver
 * (`LtiScoreSubmissionProcessor`) so it can pace the pool and drive the
 * platform-level circuit breaker. The per-item outcome is already durably
 * recorded (under a fenced lease) before this is returned.
 */
export type SubmissionOutcome =
  | { type: 'idle' }
  | {
      type: 'submitted'
      // Whether this worker still held the lease when it recorded the result.
      // False ⇒ another worker preempted it; the outcome carries no platform signal.
      leaseValid: boolean
      lineitem_id: string
      deployment_id: string
      result: SubmissionResult
    }

/**
 * Stateless per-item LTI score submission logic.
 *
 * One instance exists per platform, but it carries no mutable run state and is
 * safe to drive from multiple concurrent callers: every line item is claimed
 * with a fenced lease (see repository.ts), and all per-item state changes happen
 * through the database. Platform-level state (health, backoff, pausing) is owned
 * by the driver, `LtiScoreSubmissionProcessor`, not here.
 */
export class LtiScoreSubmitter extends BaseService {
  readonly issuer: string

  private config: Config
  private mutations: LtiScoreSubmissionMutations
  private accessTokenManager: AccessTokenManager
  private platform: PlatformRecord

  constructor(
    platform: PlatformRecord,
    logger: CoreLogger,
    config: Config,
    scoreSubmissionMutations: LtiScoreSubmissionMutations,
    accessTokenManager: AccessTokenManager
  ) {
    super(logger, 'app', 'lti')
    this.platform = platform
    this.issuer = platform.issuer
    this.config = config
    this.mutations = scoreSubmissionMutations
    this.accessTokenManager = accessTokenManager
  }

  /**
   * Claims and processes a single eligible line item, durably recording the
   * per-item outcome under its fenced lease, and reports what happened so the
   * driver can react. Returns `{ type: 'idle' }` if nothing was eligible.
   */
  @method
  async processOne(): Promise<SubmissionOutcome> {
    const lineitem = await this.mutations.claimNextEligibleLineItem(
      this.platform.issuer,
      this.config.lti.score_submission.lease_duration_seconds
    )

    if (!lineitem) {
      this.logger.trace('No eligible submissions found')
      return { type: 'idle' }
    }

    const result = await this.submitScore(lineitem)
    const leaseValid = await this.recordResult(lineitem, result)

    return {
      type: 'submitted',
      leaseValid,
      lineitem_id: lineitem.id,
      deployment_id: lineitem.deployment_id,
      result,
    }
  }

  @method
  private async submitScore(lineitem: ClaimedLineItem): Promise<SubmissionResult> {
    this.logger.debug(
      {
        lineitem_id: lineitem.id,
        lineitem_url: lineitem.lineitem_url,
        lti_user_id: lineitem.lti_user_id,
        issuer: lineitem.platform_issuer,
        progress: lineitem.submittable_progress,
      },
      'submitting score'
    )

    const accessTokenResult = await this.accessTokenManager.getAccessToken(this.platform)
    if (!accessTokenResult.ok) {
      return {
        ok: false,
        category: accessTokenResult.category,
        description: accessTokenResult.message,
        status: accessTokenResult.status_code,
      }
    }

    const { accessToken } = accessTokenResult

    const headers = new Headers()
    headers.append('Authorization', `Bearer ${accessToken.token}`)
    headers.append('Content-Type', 'application/x-www-form-urlencoded')

    const body = new URLSearchParams({
      userId: lineitem.lti_user_id,
      activityProgress: lineitem.submittable_progress < 1 ? 'Submitted' : 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
      scoreGiven: lineitem.submittable_progress.toString(),
      scoreMaximum: '1',
    })

    const response = await fetch(`${lineitem.lineitem_url}/scores`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.lti.score_submission.request_timeout_seconds * 1000),
    }).catch((err) => {
      // TODO: Should we handle TimeoutError (from the AbortSignal) differently?
      this.logger.warn(
        { err, issuer: this.platform.issuer },
        'network error in LTI score submission'
      )
      return null
    })

    if (response == null) {
      return {
        ok: false,
        category: 'transient',
        description: 'network error',
      }
    }

    const status = response.status
    const getText = () =>
      response.text().catch((err) => {
        this.logger.warn(
          { err, status, issuer: this.platform.issuer },
          'error reading LTI score submission response body'
        )
        return ''
      })

    const result = await classifyScoreSubmissionResponse(status, getText)
    if (!result.ok && result.category === 'platform_token') {
      this.accessTokenManager.invalidateAccessToken(this.platform, accessToken)
    }
    return result
  }

  /**
   * Records the per-item result against the line item, under its fenced lease.
   * Returns whether the lease was still valid (i.e. whether the write landed).
   * Touches only the line item — no platform-level state.
   */
  @method
  private async recordResult(
    lineitem: ClaimedLineItem,
    result: SubmissionResult
  ): Promise<boolean> {
    // Treat successful submissions and 'superseded' failures the same.
    if (result.ok || result.category === 'superseded') {
      return this.mutations.markSubmissionSuccess(
        lineitem,
        this.config.lti.score_submission.throttle_seconds
      )
    }

    // A failure that won't succeed on retry: retire the line item.
    if (result.category === 'lineitem_dead') {
      return this.mutations.markSubmissionDead(lineitem, result.category, result.description)
    }

    // Everything else: back the individual line item off and let the driver
    // decide whether the platform as a whole is in trouble.
    return this.mutations.markSubmissionFailure(
      lineitem,
      result.category,
      result.description,
      computeBackoffMs(this.config, lineitem.submission_error_count)
    )
  }
}

/**
 * Exponential backoff with jitter, in **milliseconds**. Shared by the per-item
 * failure backoff (here) and the driver's platform-level pause.
 */
export function computeBackoffMs(config: Config, error_count: number): number {
  const { backoff_base_seconds, backoff_error_cap } = config.lti.score_submission
  const exponent = Math.min(error_count, backoff_error_cap)
  const seconds = backoff_base_seconds * 2 ** exponent
  return seconds * 1000 * (0.9 + 0.2 * Math.random())
}
