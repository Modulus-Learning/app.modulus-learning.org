import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { Config } from '@/index.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type {
  ClaimedLineItem,
  LtiScoreSubmissionMutations,
  // LtiScoreSubmissionQueries,
  PlatformRecord,
} from './repository.js'
import type { SubmissionResult } from './types.js'

type ControlFlow =
  | { action: 'continue' }
  | { action: 'idle'; duration_ms: number }
  | { action: 'stop' }

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
export class LtiScoreSubmissionProcessor extends BaseService {
  private config: Config
  // private queries: LtiScoreSubmissionQueries
  private mutations: LtiScoreSubmissionMutations
  private accessTokenManager: AccessTokenManager
  private tx: TXManager

  private platform: PlatformRecord
  private state: 'running' | 'stopping' | 'stopped'
  private processQueuePromise?: Promise<void>

  constructor(
    platform: PlatformRecord,
    logger: CoreLogger,
    config: Config,
    tx: TXManager,
    // scoreSubmissionQueries: LtiScoreSubmissionQueries,
    scoreSubmissionMutations: LtiScoreSubmissionMutations,
    accessTokenManager: AccessTokenManager
  ) {
    super(logger, 'app', 'lti')
    this.config = config
    this.tx = tx
    // this.queries = scoreSubmissionQueries
    this.mutations = scoreSubmissionMutations
    this.accessTokenManager = accessTokenManager

    this.platform = platform
    this.state = 'stopped'
    this.start()
  }

  @method
  async start() {
    if (this.state === 'running') {
      return
    }

    if (this.state === 'stopping') {
      await this.processQueuePromise
      await this.start()
    }

    this.state = 'running'
    this.processQueuePromise = this.processQueue()
  }

  @method
  async stop() {
    if (this.state === 'running') {
      this.state = 'stopping'
    }

    await this.processQueuePromise
  }

  @method
  status(): 'running' | 'stopping' | 'stopped' {
    return this.state
  }

  @method
  private async processQueue() {
    const { issuer } = this.platform

    this.logger.info({ issuer }, 'score submission worker started')

    while (this.state === 'running') {
      try {
        const result = await this.processOne()
        switch (result.action) {
          case 'continue':
            continue
          case 'idle':
            await sleep(result.duration_ms)
            continue
          case 'stop':
            break
        }
      } catch (err) {
        this.logger.error({ err, issuer }, 'unhandled error in score submission loop')
        // TODO: backoff?
        await sleep(this.config.lti.score_submission.error_interval_ms)
      }
    }

    this.logger.info({ issuer }, 'score submission worker stopped')

    this.processQueuePromise = undefined
    this.state = 'stopped'
  }

  @method
  private async processOne(): Promise<ControlFlow> {
    const lineitem = await this.mutations.claimNextEligibleLineItem(
      this.platform.issuer,
      this.config.lti.score_submission.lease_duration_seconds
    )

    if (!lineitem) {
      this.logger.trace('No eligible submissions found -- idling')
      return {
        action: 'idle',
        duration_ms: this.config.lti.score_submission.idle_interval_ms,
      }
    }

    const result = await this.submitScore(lineitem)

    return await this.handleSubmissionResult(lineitem, result)
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

  @method
  private handleSubmissionResult(
    lineitem: ClaimedLineItem,
    result: SubmissionResult
  ): Promise<ControlFlow> {
    return this.tx.withTransaction(async () => {
      const { id: lineitem_id, platform_issuer, deployment_id } = lineitem

      const now = new Date()

      // Treat successful submissions and 'superseded' failures the same
      if (result.ok || result.category === 'superseded') {
        // Release the submission lease and update submitted_progress
        const wasLeaseValid = await this.mutations.markSubmissionSuccess(
          lineitem,
          this.config.lti.score_submission.throttle_seconds
        )

        // Make further updates only if the lease was still valid.  If it wasn't valid,
        // that means another worker might already have claimed this lineitem, and could
        // even have already finished its submission and updated the lineitem table.
        // Since submission to canvas is idempotent, there's nothing we really have to
        // update in that case.
        if (wasLeaseValid) {
          const oldPlatformHealth = await this.mutations.getPlatformHealthForUpdate(platform_issuer)

          // Mark the platform as healthy and unpaused.
          await this.mutations.setPlatformHealth(platform_issuer, now, {
            status: 'healthy',
            paused_until: null,
            last_success_at: now,
            consecutive_failures: 0,
          })

          // If the platform was previously not healthy, record a single submission
          // event demarking the transition from not healthy to healthy.
          if (oldPlatformHealth?.status !== 'healthy') {
            await this.mutations.recordSubmissionEvent({
              id: uuidv7(),
              platform_issuer,
              deployment_id,
              lineitem_id,
              occurred_at: now,
              outcome: 'recovery',
            })
          }
          this.logger.debug({ lineitem_id, superseded: !result.ok }, 'submitted LTI score')
        } else {
          this.logger.warn({ lineitem_id, superseded: !result.ok }, 'LTI submission lease expired')
        }

        return { action: 'continue' }
      }

      // The submission failed, and based on the error code/message we expect
      // further submissions to continue failing.  Mark the lineitem dead,
      // and mark the platform as 'healthy' (this kind of failure is expected,
      // and points to a functioning connection to the platform).  TODO: Should
      // we also include lineitems whose submission_error_count exceeds some threshold
      // here?
      if (result.category === 'lineitem_dead') {
        const leaseValid = await this.mutations.markSubmissionDead(
          lineitem,
          result.category,
          result.description
        )

        if (leaseValid) {
          const oldPlatformHealth = await this.mutations.getPlatformHealthForUpdate(platform_issuer)

          // Mark the platform as healthy and unpaused (the platform identified
          // the lineitem as dead, but that implies the connection to the platform
          // itself is healthy).
          await this.mutations.setPlatformHealth(platform_issuer, now, {
            status: 'healthy',
            paused_until: null,
            last_success_at: now,
            consecutive_failures: 0,
          })

          // If the platform was previously not healthy, record a single submission
          // event demarking the transition from not healthy to healthy.
          if (oldPlatformHealth?.status !== 'healthy') {
            await this.mutations.recordSubmissionEvent({
              id: uuidv7(),
              platform_issuer,
              deployment_id,
              lineitem_id,
              occurred_at: now,
              outcome: 'recovery',
            })
          }

          this.logger.debug({ lineitem_id, message: result.description }, 'marked lineitem dead')
        } else {
          this.logger.warn({ lineitem_id }, 'LTI submission lease expired')
        }

        return { action: 'continue' }
      }

      // For all remaining errors, we increment the failure count for the lineitem,
      // record the submission failure, and set platform health to 'degraded' or
      // 'rate-limited'.  The error is probably not this particular line-item's
      // "fault", but we still throttle future submissions based on the number of
      // successive failures.
      const leaseValid = await this.mutations.markSubmissionFailure(
        lineitem,
        result.category,
        result.description,
        this.computeBackoffMs(lineitem.submission_error_count)
      )

      if (leaseValid) {
        // Record the submission error.
        await this.mutations.recordSubmissionEvent({
          id: uuidv7(),
          platform_issuer,
          deployment_id,
          lineitem_id,
          occurred_at: now,
          outcome: 'failure',
          category: result.category,
          http_status: result.status,
          detail: result.description,
        })

        const platformHealth = await this.mutations.getPlatformHealthForUpdate(this.platform.issuer)
        const consecutive_failures = platformHealth?.consecutive_failures ?? 0
        const platformBackoff = this.computeBackoffMs(consecutive_failures)

        if (result.category === 'rate_limit') {
          // TODO: See if canvas returns a Retry-After header, and honor
          // it instead of using consecutive_failures to drive the backoff here.
          await this.mutations.setPlatformHealth(this.platform.issuer, now, {
            last_failure_at: now,
            status: 'rate-limited',
            paused_until: new Date(now.getTime() + platformBackoff),
            consecutive_failures: consecutive_failures + 1,
          })

          return { action: 'idle', duration_ms: platformBackoff }
        }

        // For now, just go into exponential backoff with status 'degraded'
        // for all errors.  TODO: add "incident" detection based on
        // recent errors; set status to 'incident' and notify admins
        await this.mutations.setPlatformHealth(this.platform.issuer, now, {
          last_failure_at: now,
          status: 'degraded',
          paused_until: new Date(now.getTime() + platformBackoff),
          consecutive_failures: consecutive_failures + 1,
        })

        this.logger.debug(
          { lineitem_id, category: result.category, message: result.description },
          'LTI score submisison failed'
        )

        return { action: 'idle', duration_ms: platformBackoff }
      }

      this.logger.warn({ lineitem_id }, 'LTI submission lease expired')
      return { action: 'continue' }
    })
  }

  computeBackoffMs(error_count: number) {
    const { backoff_base_seconds, backoff_error_cap } = this.config.lti.score_submission
    const exponent = Math.min(error_count, backoff_error_cap)
    const seconds = backoff_base_seconds * 2 ** exponent
    return seconds * 1000 * (0.9 + 0.2 * Math.random())
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
