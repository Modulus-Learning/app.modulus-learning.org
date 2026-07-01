import { BaseService, method } from '@/lib/base-service.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { IncidentSink } from './incident-sink.js'
import type { LtiScoreSubmissionMutations, LtiScoreSubmissionQueries } from './repository.js'

/**
 * Global background sweep that turns incidents into admin notifications.
 *
 * It is not part of any per-platform driver and works purely off the incident
 * table, so it survives restarts and never touches the submission hot path. It
 * pages high-severity incidents whose *active span* has reached the persist
 * threshold, and sends an all-clear when a paged incident resolves. Both are
 * claimed with idempotent DB latches (`notified_at` / `resolved_notified_at`),
 * so concurrent or future multi-process sweeps each fire exactly once.
 *
 * Delivery is claim-then-deliver (at-most-once): the latch is taken before the
 * sink is called. The default `LoggingIncidentSink` cannot fail; a fallible
 * channel would want different ordering or a retry.
 */
export class LtiIncidentNotifier extends BaseService {
  private config: Config
  private queries: LtiScoreSubmissionQueries
  private mutations: LtiScoreSubmissionMutations
  private sink: IncidentSink

  private desiredRunning = false
  private runPromise?: Promise<void>
  private wakeResolve?: () => void

  constructor(
    logger: CoreLogger,
    config: Config,
    queries: LtiScoreSubmissionQueries,
    mutations: LtiScoreSubmissionMutations,
    sink: IncidentSink
  ) {
    super(logger, 'app', 'lti')
    this.config = config
    this.queries = queries
    this.mutations = mutations
    this.sink = sink
  }

  @method
  start(): void {
    if (this.desiredRunning) {
      return
    }
    this.desiredRunning = true
    this.runPromise = this.run()
  }

  @method
  stop(): Promise<void> {
    this.desiredRunning = false
    this.wake()
    return this.runPromise ?? Promise.resolve()
  }

  private async run(): Promise<void> {
    this.logger.info('incident notifier started')
    const intervalMs = this.config.lti.score_submission.notify_poll_interval_seconds * 1000

    while (this.desiredRunning) {
      await this.sweepOnce().catch((err) =>
        this.logger.warn({ err }, 'incident notifier sweep failed')
      )
      if (!this.desiredRunning) {
        break
      }
      await this.sleep(intervalMs)
    }

    this.runPromise = undefined
    this.logger.info('incident notifier stopped')
  }

  private async sweepOnce(): Promise<void> {
    const persist = this.config.lti.score_submission.notify_persist_threshold_seconds

    for (const incident of await this.queries.getIncidentsToPage(persist)) {
      const claimed = await this.mutations.claimIncidentPage(incident.id)
      if (claimed) {
        await this.sink
          .page(incident)
          .catch((err) =>
            this.logger.warn({ err, incident_id: incident.id }, 'failed to deliver incident page')
          )
      }
    }

    for (const incident of await this.queries.getIncidentsToAllClear()) {
      const claimed = await this.mutations.claimIncidentAllClear(incident.id)
      if (claimed) {
        await this.sink
          .allClear(incident)
          .catch((err) =>
            this.logger.warn(
              { err, incident_id: incident.id },
              'failed to deliver incident all-clear'
            )
          )
      }
    }
  }

  /** Interruptible sleep so `stop()` returns promptly. */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeResolve = undefined
        resolve()
      }, ms)
      this.wakeResolve = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  private wake(): void {
    const resolve = this.wakeResolve
    this.wakeResolve = undefined
    resolve?.()
  }
}
