import { BaseService, method } from '@/lib/base-service.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiAgsClient } from './ags-client.js'
import type { ClaimedLineItem, LtiScoreSubmissionMutations } from './repository.js'
import type { RateLimitReading, SubmissionResult } from './types.js'

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
      // Rate-limit quota headers from the response, when present (feeds the
      // driver's QuotaGovernor). Independent of `leaseValid` — the request hit
      // Canvas and consumed quota regardless of who owns the line item.
      reading?: RateLimitReading
    }

/**
 * Stateless per-item LTI score submission orchestration.
 *
 * One instance exists per platform, but it carries no mutable run state and is
 * safe to drive from multiple concurrent callers: every line item is claimed
 * with a fenced lease (see repository.ts), and all per-item state changes happen
 * through the database. The platform round-trip -- tokens, AGS payload, HTTP,
 * classification -- lives behind the injected `LtiAgsClient`; platform-level
 * state (health, backoff, pausing) is owned by the driver,
 * `LtiScoreSubmissionProcessor`. This class is just claim -> publish -> record.
 */
export class LtiScoreSubmitter extends BaseService {
  readonly issuer: string

  private config: Config
  private mutations: LtiScoreSubmissionMutations
  private agsClient: LtiAgsClient

  constructor(deps: {
    logger: CoreLogger
    config: Config
    scoreSubmissionMutations: LtiScoreSubmissionMutations
    agsClient: LtiAgsClient
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.mutations = deps.scoreSubmissionMutations
    this.agsClient = deps.agsClient
    this.issuer = deps.agsClient.issuer
  }

  /**
   * Claims and processes a single eligible line item, durably recording the
   * per-item outcome under its fenced lease, and reports what happened so the
   * driver can react. Returns `{ type: 'idle' }` if nothing was eligible.
   */
  @method
  async processOne(): Promise<SubmissionOutcome> {
    const lineitem = await this.mutations.claimNextEligibleLineItem(
      this.issuer,
      this.config.lti.score_submission.lease_duration_seconds
    )

    if (!lineitem) {
      this.logger.trace('No eligible submissions found')
      return { type: 'idle' }
    }

    const { result, reading } = await this.agsClient.publishScore({
      lineitemUrl: lineitem.lineitem_url,
      ltiUserId: lineitem.lti_user_id,
      scoreGiven: lineitem.submittable_progress,
    })
    const leaseValid = await this.recordResult(lineitem, result)

    return {
      type: 'submitted',
      leaseValid,
      lineitem_id: lineitem.id,
      deployment_id: lineitem.deployment_id,
      result,
      reading,
    }
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
