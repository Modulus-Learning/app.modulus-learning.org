import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { Config } from '@/index.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type {
  LtiScoreSubmissionMutations,
  LtiScoreSubmissionQueries,
  PlatformRecord,
} from './repository.js'
import type { PendingSubmission, SubmissionResult } from './types.js'

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
  private queries: LtiScoreSubmissionQueries
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
    scoreSubmissionQueries: LtiScoreSubmissionQueries,
    scoreSubmissionMutations: LtiScoreSubmissionMutations,
    accessTokenManager: AccessTokenManager
  ) {
    super(logger, 'app', 'lti')
    this.config = config
    this.tx = tx
    this.queries = scoreSubmissionQueries
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
    const pending = await this.claimNextPendingSubmission()
    if (!pending) {
      this.logger.trace('No pending submissions found -- idling')
      return {
        action: 'idle',
        duration_ms: this.config.lti.score_submission.idle_interval_ms,
      }
    }

    // Handle the case where the pending lineitem's cutoff_at time has passed.
    if (pending.cutoff_at != null && pending.cutoff_at.getTime() < Date.now()) {
      // Find the progress as of the cutoff time.
      const progressAtCutoff = await this.queries.getProgressAtCutoff(
        pending.user_id,
        pending.activity_id,
        pending.cutoff_at
      )

      // If there's still progress to submit,
      if (progressAtCutoff > pending.submitted_progress) {
        pending.current_progress = progressAtCutoff
      } else {
        // The progress value that was present at cutoff time has already
        // been submitted, and we're already past the cutoff time (so any
        // further progress events we recieve will not be submittable against
        // this line item).  Mark the line item as dead, and move on.
        return await this.handleCutoffSubmission(pending)
      }
    }

    const result = await this.submitScore(pending)

    return await this.handleSubmissionResult(pending, result)
  }

  @method
  private claimNextPendingSubmission(): Promise<PendingSubmission | undefined> {
    return this.tx.withTransaction(async () => {
      const pendingSubmission = await this.mutations.findNextPendingSubmission(
        this.platform.issuer,
        {
          debounceSeconds: this.config.lti.score_submission.debounce_seconds,
        }
      )

      if (pendingSubmission != null) {
        const claimed = await this.mutations.claimLineItemForSubmission(
          pendingSubmission.lineitem_id,
          {
            lockTimeoutSeconds: this.config.lti.score_submission.lock_timeout_seconds,
          }
        )

        if (claimed) {
          return pendingSubmission
        }
      }
    })
  }

  @method
  private async submitScore(pending: PendingSubmission): Promise<SubmissionResult> {
    this.logger.debug(
      {
        lineitem_id: pending.lineitem_id,
        lineitem_url: pending.lineitem_url,
        lti_user_id: pending.lti_user_id,
        issuer: pending.platform_issuer,
        progress: pending.current_progress,
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
      userId: pending.lti_user_id,
      activityProgress: pending.current_progress < 1 ? 'Submitted' : 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
      scoreGiven: pending.current_progress.toString(),
      scoreMaximum: '1',
    })

    const response = await fetch(`${pending.lineitem_url}/scores`, {
      method: 'POST',
      headers,
      body,
    }).catch((err) => {
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
    pending: PendingSubmission,
    result: SubmissionResult
  ): Promise<ControlFlow> {
    return this.tx.withTransaction(async () => {
      const { lineitem_id, platform_issuer, deployment_id, current_progress } = pending

      const now = new Date()

      // Treat superseded failure the same as a success.
      if (result.ok || result.category === 'superseded') {
        // Update submitted progress, mark the lineitem 'ready', unlock it, clear any errors.
        await this.mutations.updateLineItem(lineitem_id, {
          submitted_progress: current_progress,
          submitted_at: now,
          submission_status: 'ready',
          submission_locked_until: null,
          submission_error_count: 0,
          submission_error_category: null,
          submission_error_message: null,
          updated_at: now,
        })

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

        return { action: 'continue' }
      }

      if (result.category === 'lineitem_dead') {
        // Mark the lineitem as dead.
        await this.mutations.updateLineItem(lineitem_id, {
          submission_status: 'dead',
          submission_locked_until: null,
          submission_error_count: pending.submission_error_count + 1,
          submission_error_category: result.category,
          submission_error_message: result.description,
          updated_at: now,
        })

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

        return { action: 'continue' }
      }

      // All remaining errors put the lineitem in 'backoff'.  The error is probably not
      // this particular line-item's "fault", but on the unlikely chance it is, we set a
      // backoff so that a different line-item, if available, will be selected for our
      // next retry.
      const lineItemBackoff = this.computeBackoffMs(pending.submission_error_count)
      await this.mutations.updateLineItem(lineitem_id, {
        submission_status: 'backoff',
        submission_locked_until: new Date(now.getTime() + lineItemBackoff),
        submission_error_count: pending.submission_error_count + 1,
        submission_error_category: result.category,
        submission_error_message: result.description,
        updated_at: now,
      })

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
    })
  }

  async handleCutoffSubmission(pending: PendingSubmission): Promise<ControlFlow> {
    await this.mutations.updateLineItem(pending.lineitem_id, {
      submission_status: 'dead',
      submission_locked_until: null,
      submission_error_count: 0,
      submission_error_category: 'lineitem_dead',
      submission_error_message: 'cutoff time has passed',
      updated_at: new Date(),
    })

    return { action: 'continue' }
  }

  computeBackoffMs(error_count: number) {
    const { backoff_base_seconds, backoff_error_cap } = this.config.lti.score_submission
    const exponent = Math.min(error_count, backoff_error_cap)
    const seconds = backoff_base_seconds * 2 ** exponent
    return seconds * 500 * (1 + Math.random())
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
