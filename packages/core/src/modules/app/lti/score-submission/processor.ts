import { BaseService, method } from '@/lib/base-service.js'
import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { Config } from '@/index.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type { LtiScoreSubmissionMutations, PlatformRecord } from './repository.js'
import type { PendingSubmission, SubmissionError } from './types.js'

type ControlFlow = 'continue' | 'idle'

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
        const action = await this.processOne()
        switch (action) {
          case 'continue':
            continue
          case 'idle':
            await sleep(this.config.lti.score_submission.idle_interval_ms)
            continue
        }
      } catch (err) {
        this.logger.error({ err, issuer }, 'unhandled error in score submission loop')
        // TODO: Is this a reasonable interval?
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
      return 'idle'
    }

    this.logger.debug({ score: pending }, 'Attempting to submit score')

    const submissionError = await this.submitScore(pending)
    if (submissionError == null) {
      return await this.handleSubmissionSuccess(pending)
    }

    return await this.handleSubmissionFailure(pending, submissionError)
  }

  @method
  private async claimNextPendingSubmission(): Promise<PendingSubmission | undefined> {
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
  private async submitScore(pending: PendingSubmission): Promise<SubmissionError | undefined> {
    const accessToken = await this.accessTokenManager.getAccessToken(this.platform)

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
      return { category: 'transient', description: 'network or other transient error' }
    }

    if (response.ok) {
      this.logger.debug(
        {
          issuer: pending.platform_issuer,
          lineitem_id: pending.lineitem_id,
          progress: pending.current_progress,
        },
        'score submitted successfully'
      )

      return
    }

    const status = response.status
    const text = await response.text().catch((err) => {
      this.logger.warn(
        { err, issuer: this.platform.issuer },
        'error reading LTI score submission response body'
      )
      return ''
    })

    this.logger.debug(
      {
        issuer: pending.platform_issuer,
        lineitem_id: pending.lineitem_id,
        progress: pending.current_progress,
        status,
        text,
      },
      'score submission failed'
    )

    return await classifyScoreSubmissionResponse(status, text)
  }

  @method
  private async handleSubmissionSuccess({
    lineitem_id,
    platform_issuer,
    current_progress,
  }: PendingSubmission): Promise<ControlFlow> {
    await this.mutations.updateLineItem(lineitem_id, {
      submitted_progress: current_progress,
      submission_status: 'healthy',
      submission_locked_until: null,
      submission_error_count: 0,
      submission_error_category: null,
      submission_error_message: null,
      submitted_at: new Date(),
    })

    await this.mutations.clearPlatformErrors(platform_issuer)

    return 'continue'
  }

  @method
  private async handleSubmissionFailure(
    { lineitem_id, platform_issuer, current_progress, submission_error_count }: PendingSubmission,
    error: SubmissionError
  ): Promise<ControlFlow> {
    if (error.category === 'superseded') {
      // TODO: LOG

      await this.mutations.updateLineItem(lineitem_id, {
        submitted_progress: current_progress,
        submission_status: 'healthy',
        submission_locked_until: null,
        submission_error_count: 0,
        submission_error_category: null,
        submission_error_message: null,
        submitted_at: new Date(),
      })

      await this.mutations.clearPlatformErrors(platform_issuer)

      return 'continue'
    }

    if (error.category === 'lineitem_dead' || submission_error_count >= 10) {
      // TODO: LOG

      await this.mutations.updateLineItem(lineitem_id, {
        submission_status: 'dead',
        submission_locked_until: null,
        submission_error_count: submission_error_count + 1,
        submission_error_category: error.category,
        submission_error_message: error.description,
      })

      await this.mutations.clearPlatformErrors(platform_issuer)

      return 'continue'
    }

    const { backoff_base_seconds, backoff_error_cap } = this.config.lti.score_submission
    const backoff = backoff_base_seconds * 2 ** Math.min(submission_error_count, backoff_error_cap)
    const submission_locked_until = new Date(Date.now() + backoff * 1000)

    const new_error_count =
      error.category === 'malformed'
        ? submission_error_count + 1
        : error.category === 'unknown'
          ? Math.min(submission_error_count + 1, 9)
          : 1

    // TODO: LOG

    await this.mutations.updateLineItem(lineitem_id, {
      submission_status: 'cooldown',
      submission_locked_until,
      submission_error_count: new_error_count,
      submission_error_category: error.category,
      submission_error_message: error.description,
    })

    if (error.category === 'transient' || error.category === 'unknown') {
      await this.mutations.incrementTransientPlatformErrors(platform_issuer)
    } else {
      await this.mutations.incrementPermanentPlatformErrors(platform_issuer)
    }

    return 'idle'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
