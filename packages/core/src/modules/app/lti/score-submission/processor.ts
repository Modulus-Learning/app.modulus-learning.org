import { BaseService, method } from '@/lib/base-service.js'
import { IncidentTracker } from './incident-tracker.js'
import { QuotaGovernor } from './quota-governor.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { FailureInfo, IncidentEffect } from './incident-tracker.js'
import type { LtiScoreSubmissionMutations, LtiScoreSubmissionQueries } from './repository.js'
import type { LtiScoreSubmitter, SubmissionOutcome } from './submitter.js'

type LaneOutcome = SubmissionOutcome | { type: 'error' }

/**
 * Lifecycle + pacing layer for a single platform's score submission queue.
 *
 * Owns the run state and a bounded pool of concurrent submission tasks, each of
 * which drives the (stateless) `LtiScoreSubmitter`. Per-item work is coordinated
 * through the database (fenced leases + `SKIP LOCKED`), so running several tasks
 * at once is safe. Platform-level state — the circuit breaker and incident
 * detection — lives in an `IncidentTracker`; the governor sizes concurrency from
 * quota headroom. Both are in-memory and per-process (single-process for now).
 *
 * The tracker is fed outcomes synchronously and returns ordered DB `effects`,
 * which are drained through a FIFO queue so writes land in decision order (a
 * failure row exists before it is backfilled; an incident exists before a later
 * failure references it).
 *
 * Start/stop uses desired-vs-actual reconciliation: `desiredRunning` is what the
 * caller wants, `runPromise` is the single live run loop, and the two are
 * reconciled in `ensureRunning()` — so there is never more than one loop, and a
 * `start()` issued mid-shutdown restarts cleanly once the drain completes.
 */
export class LtiScoreSubmissionProcessor extends BaseService {
  private config: Config
  private submitter: LtiScoreSubmitter
  private mutations: LtiScoreSubmissionMutations
  private queries: LtiScoreSubmissionQueries
  private maxConcurrency: number
  private governor: QuotaGovernor
  private tracker: IncidentTracker

  private desiredRunning = false
  private runPromise?: Promise<void>
  // Reconcile any persisted open incident exactly once, on first run.
  private reconciled = false

  // True when the last claim found nothing; collapses the pool to a single poller.
  private idle = false

  private inFlight = new Set<Promise<void>>()
  // One-shot signal used to wake the run loop when a task settles or on stop().
  private signalResolve?: () => void
  private signalPending = false

  // FIFO queue of persistence effects emitted by the tracker.
  private effectQueue: IncidentEffect[] = []
  private drainPromise: Promise<void> = Promise.resolve()

  constructor(
    logger: CoreLogger,
    config: Config,
    submitter: LtiScoreSubmitter,
    mutations: LtiScoreSubmissionMutations,
    queries: LtiScoreSubmissionQueries
  ) {
    super(logger, 'app', 'lti')
    this.config = config
    this.submitter = submitter
    this.mutations = mutations
    this.queries = queries

    const ss = config.lti.score_submission
    this.maxConcurrency = Math.max(1, ss.max_concurrent_submissions)
    this.governor = new QuotaGovernor(
      this.maxConcurrency,
      ss.quota_reserve_requests,
      ss.quota_window_ms,
      ss.quota_ramp_interval_ms
    )
    this.tracker = new IncidentTracker(submitter.issuer, config, this.logger)
  }

  @method
  start(): void {
    this.desiredRunning = true
    this.ensureRunning()
  }

  /**
   * Signals the run loop to stop and returns a promise that resolves once all
   * in-flight submissions have drained.
   */
  @method
  stop(): Promise<void> {
    this.desiredRunning = false
    this.signal()
    return this.runPromise ?? Promise.resolve()
  }

  @method
  status(): 'running' | 'stopping' | 'stopped' {
    if (this.runPromise == null) {
      return 'stopped'
    }
    return this.desiredRunning ? 'running' : 'stopping'
  }

  private ensureRunning(): void {
    if (this.runPromise != null) {
      return
    }
    if (!this.desiredRunning) {
      return
    }
    this.runPromise = this.run().finally(() => {
      this.runPromise = undefined
      this.ensureRunning()
    })
  }

  @method
  private async run(): Promise<void> {
    const { issuer } = this.submitter
    this.logger.info(
      { issuer, max_concurrency: this.maxConcurrency },
      'score submission worker started'
    )

    await this.reconcileOpenIncident()

    while (this.desiredRunning) {
      const now = Date.now()

      // Time-based incident recovery (close after sustained quiet).
      this.enqueue(this.tracker.tick(now))

      let breaker = this.tracker.breaker

      // Paused: wait out the backoff, then let any pre-pause tasks drain before
      // probing with a single submission (half-open).
      if (breaker.state === 'open') {
        if (now < breaker.until) {
          await this.wait(breaker.until - now)
          continue
        }
        if (this.inFlight.size > 0) {
          await this.wait()
          continue
        }
        this.tracker.promoteToHalfOpen()
        breaker = this.tracker.breaker
      }

      // half_open → exactly one probe; idle → a single poller; otherwise the
      // quota governor's current allowance.
      const halfOpen = breaker.state === 'half_open'
      const target = halfOpen ? 1 : this.idle ? 1 : this.governor.target()

      // When the queue is empty, collapse to a single poller paced at
      // idle_interval: let the pool drain to zero, sleep, then allow one probe to
      // re-check. Clearing `idle` is optimistic — a probe that finds nothing sets
      // it again next time; a probe that finds work ramps back up to full target.
      if (this.idle && this.inFlight.size === 0) {
        await this.wait(this.config.lti.score_submission.idle_interval_ms)
        if (!this.desiredRunning) {
          break
        }
        this.idle = false
      }

      // Top up the pool toward target. (State is necessarily 'closed' or
      // 'half_open' here and can't change synchronously inside this loop.)
      while (this.desiredRunning && this.inFlight.size < target) {
        this.spawnTask()
        if (halfOpen) {
          break
        }
      }

      if (this.inFlight.size === 0) {
        // Only reachable when desiredRunning flipped false mid-iteration; the
        // pending stop signal makes this wait return immediately.
        await this.wait(this.config.lti.score_submission.idle_interval_ms)
        continue
      }

      // Wait for the next task to settle (it will already have updated state).
      await this.wait()
    }

    await Promise.allSettled([...this.inFlight])
    await this.drainPromise
    this.logger.info({ issuer }, 'score submission worker stopped')
  }

  /** Adopt or hard-cap-close any persisted open incident, once on first run. */
  private async reconcileOpenIncident(): Promise<void> {
    if (this.reconciled) {
      return
    }
    this.reconciled = true
    try {
      const open = await this.queries.getOpenIncidentForPlatform(this.submitter.issuer)
      if (open) {
        this.enqueue(this.tracker.adopt(open, Date.now()))
      }
    } catch (err) {
      this.logger.warn(
        { err, issuer: this.submitter.issuer },
        'failed to reconcile open incident on startup'
      )
    }
  }

  private spawnTask(): void {
    const task = this.runOne().finally(() => {
      this.inFlight.delete(task)
      this.signal()
    })
    this.inFlight.add(task)
  }

  private async runOne(): Promise<void> {
    let outcome: LaneOutcome
    try {
      outcome = await this.submitter.processOne()
    } catch (err) {
      this.logger.error(
        { err, issuer: this.submitter.issuer },
        'unhandled error in score submission task'
      )
      outcome = { type: 'error' }
    }

    this.applyOutcome(outcome)
  }

  /**
   * Classifies a single task outcome and folds it into the tracker (synchronous,
   * so concurrent settlements can't interleave on breaker/incident state),
   * enqueueing whatever DB effects the tracker emits.
   */
  private applyOutcome(outcome: LaneOutcome): void {
    const now = Date.now()

    if (outcome.type === 'idle') {
      this.idle = true
      return
    }
    this.idle = false

    if (outcome.type === 'error') {
      // An internal exception that prevented the attempt: counts as a failure.
      this.applyFailure({ category: 'internal' }, now)
      return
    }

    // Feed the quota governor regardless of lease — the request hit Canvas and
    // the reading reflects the (shared) quota. A hard rate-limit means our
    // estimate was wrong, so reset the governor to re-earn concurrency.
    if (outcome.reading) {
      this.governor.record(outcome.reading)
    }
    if (!outcome.result.ok && outcome.result.category === 'rate_limit') {
      this.governor.reset()
    }

    if (!outcome.leaseValid) {
      // Preempted by another worker; it owns the outcome. No platform signal.
      return
    }

    const { result } = outcome

    // Success, a superseded write, or a dead line item are all clean round-trips
    // (we reached Canvas and acted on its response).
    if (result.ok || result.category === 'superseded' || result.category === 'lineitem_dead') {
      this.enqueue(
        this.tracker.recordClean(
          { lineitem_id: outcome.lineitem_id, deployment_id: outcome.deployment_id },
          now
        )
      )
      return
    }

    // Everything else (incl. malformed) counts toward the breaker / incident.
    this.applyFailure(
      {
        category: result.category,
        lineitem_id: outcome.lineitem_id,
        deployment_id: outcome.deployment_id,
        http_status: result.status,
        detail: result.description,
      },
      now
    )
  }

  /**
   * Folds a failure into the tracker and, if it just tripped the breaker
   * (closed/half_open → open), resets the governor so concurrency re-ramps
   * conservatively from cold-start after the platform recovers.
   */
  private applyFailure(info: FailureInfo, now: number): void {
    const before = this.tracker.breaker.state
    this.enqueue(this.tracker.recordFailure(info, now))
    if (this.tracker.breaker.state === 'open' && before !== 'open') {
      this.governor.reset()
    }
  }

  // --- effect persistence (FIFO) ---------------------------------------------

  private enqueue(effects: IncidentEffect[]): void {
    if (effects.length === 0) {
      return
    }
    this.effectQueue.push(...effects)
    // Chain each drain off the previous so effects persist incrementally during
    // the run, serialized in enqueue order (a failure row before its backfill, an
    // incident before dependents). `run` awaits the tail as a shutdown flush.
    this.drainPromise = this.drainPromise.then(() => this.drainOnce())
  }

  private async drainOnce(): Promise<void> {
    while (this.effectQueue.length > 0) {
      const effect = this.effectQueue.shift()
      if (!effect) {
        return
      }
      await this.executeEffect(effect).catch((err) =>
        this.logger.warn(
          { err, issuer: this.submitter.issuer, kind: effect.kind },
          'failed to persist incident effect'
        )
      )
    }
  }

  private async executeEffect(effect: IncidentEffect): Promise<void> {
    const issuer = this.submitter.issuer
    switch (effect.kind) {
      case 'logFailure':
        await this.mutations.recordSubmissionFailure(effect.failure)
        break
      case 'openIncident':
        await this.mutations.openIncident(effect.incident)
        break
      case 'backfillFailures':
        await this.mutations.backfillFailureIncident(effect.incidentId, effect.failureIds)
        break
      case 'updateIncident':
        await this.mutations.updateIncidentAggregates(effect.id, effect.fields)
        break
      case 'closeIncident':
        await this.mutations.closeIncident(effect.id, effect.resolvedAt)
        break
      case 'setHealth':
        await this.mutations.setPlatformHealth(issuer, effect.at, effect.data)
        break
    }
  }

  // --- run-loop wakeup signal -------------------------------------------------
  // `wait()` sleeps until a task settles, an optional timeout elapses, or stop()
  // is called. `signal()` wakes it; a signal that arrives before the next wait
  // is coalesced via `signalPending` so wakeups are never missed.

  private signal(): void {
    if (this.signalResolve) {
      const resolve = this.signalResolve
      this.signalResolve = undefined
      resolve()
    } else {
      this.signalPending = true
    }
  }

  private wait(timeoutMs?: number): Promise<void> {
    if (this.signalPending) {
      this.signalPending = false
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      if (timeoutMs != null) {
        timer = setTimeout(() => {
          this.signalResolve = undefined
          resolve()
        }, timeoutMs)
      }
      this.signalResolve = () => {
        if (timer) {
          clearTimeout(timer)
        }
        resolve()
      }
    })
  }
}
