import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { QuotaGovernor } from './quota-governor.js'
import { computeBackoffMs } from './submitter.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiScoreSubmissionMutations } from './repository.js'
import type { LtiScoreSubmitter, SubmissionOutcome } from './submitter.js'

type BreakerState = 'closed' | 'open' | 'half_open'

type LaneOutcome = SubmissionOutcome | { type: 'error' }

// A platform-health change to persist (transitions only). The in-memory breaker
// is authoritative for pacing; this is written for observability.
type HealthAction =
  | { kind: 'healthy'; recovery: boolean; lineitem_id: string; deployment_id: string }
  | {
      kind: 'fault'
      status: 'degraded' | 'rate-limited'
      until: number
      consecutiveFailures: number
      lineitem_id?: string
      deployment_id?: string
      category?: string
      http_status?: number
      detail?: string
    }

/**
 * Lifecycle + pacing layer for a single platform's score submission queue.
 *
 * Owns the run state and a bounded pool of concurrent submission tasks, each of
 * which drives the (stateless) `LtiScoreSubmitter`. Per-item work is coordinated
 * through the database (fenced leases + `SKIP LOCKED`), so running several tasks
 * at once is safe. This layer owns everything *platform*-level: pacing the pool,
 * collapsing to a single poller when the queue is empty, and a circuit breaker
 * that pauses the whole platform on faults.
 *
 * Start/stop uses desired-vs-actual reconciliation: `desiredRunning` is what the
 * caller wants, `runPromise` is the single live run loop, and the two are
 * reconciled in `ensureRunning()` — so there is never more than one loop, and a
 * `start()` issued mid-shutdown restarts cleanly once the drain completes.
 *
 * NOTE: platform state is in-memory and per-process. Coordinating it across
 * processes/restarts is deliberately out of scope for now.
 */
export class LtiScoreSubmissionProcessor extends BaseService {
  private config: Config
  private submitter: LtiScoreSubmitter
  private mutations: LtiScoreSubmissionMutations
  private maxConcurrency: number
  private governor: QuotaGovernor

  private desiredRunning = false
  private runPromise?: Promise<void>

  // The circuit breaker: closed = normal; open = paused until `until`;
  // half_open = allow a single probe to test the platform.
  private breaker = { state: 'closed' as BreakerState, until: 0, consecutiveFailures: 0 }
  // True when the last claim found nothing; collapses the pool to a single poller.
  private idle = false

  private inFlight = new Set<Promise<void>>()
  // One-shot signal used to wake the run loop when a task settles or on stop().
  private signalResolve?: () => void
  private signalPending = false

  constructor(
    logger: CoreLogger,
    config: Config,
    submitter: LtiScoreSubmitter,
    mutations: LtiScoreSubmissionMutations
  ) {
    super(logger, 'app', 'lti')
    this.config = config
    this.submitter = submitter
    this.mutations = mutations

    const ss = config.lti.score_submission
    this.maxConcurrency = Math.max(1, ss.max_concurrent_submissions)
    this.governor = new QuotaGovernor(
      this.maxConcurrency,
      ss.quota_reserve_requests,
      ss.quota_window_ms,
      ss.quota_ramp_interval_ms
    )
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

    while (this.desiredRunning) {
      const now = Date.now()

      // Paused: wait out the backoff, then let any pre-pause tasks drain before
      // probing with a single submission (half-open).
      if (this.breaker.state === 'open') {
        if (now < this.breaker.until) {
          await this.wait(this.breaker.until - now)
          continue
        }
        if (this.inFlight.size > 0) {
          await this.wait()
          continue
        }
        this.breaker.state = 'half_open'
        this.logger.info({ issuer }, 'score submission breaker half-open')
      }

      // half_open → exactly one probe; idle → a single poller; otherwise the
      // quota governor's current allowance.
      const halfOpen = this.breaker.state === 'half_open'
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
    this.logger.info({ issuer }, 'score submission worker stopped')
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

    const action = this.applyOutcome(outcome)
    if (action) {
      await this.persistHealth(action).catch((err) =>
        this.logger.warn(
          { err, issuer: this.submitter.issuer },
          'failed to persist platform health'
        )
      )
    }
  }

  /**
   * Folds a single task outcome into the in-memory breaker state and returns the
   * platform-health transition to persist, if any. Synchronous, so concurrent
   * task settlements can't interleave on breaker state.
   */
  private applyOutcome(outcome: LaneOutcome): HealthAction | null {
    if (outcome.type === 'idle') {
      this.idle = true
      return null
    }
    this.idle = false

    if (outcome.type === 'error') {
      // Unexpected/infra error: pause briefly without escalating the platform
      // failure count. Not recorded as a platform fault. (Don't re-trip if a
      // sibling already opened the breaker.)
      if (this.breaker.state !== 'open') {
        this.breaker.state = 'open'
        this.breaker.until = Date.now() + this.config.lti.score_submission.error_interval_ms
      }
      return null
    }

    // Feed the quota governor regardless of lease or breaker state — the request
    // hit Canvas and the reading reflects the (shared) quota. A hard rate-limit
    // means our estimate was wrong, so reset the governor to re-earn concurrency.
    if (outcome.reading) {
      this.governor.record(outcome.reading)
    }
    if (!outcome.result.ok && outcome.result.category === 'rate_limit') {
      this.governor.reset()
    }

    // While paused, ignore outcomes from tasks that were already in flight when
    // the breaker tripped — only the half-open probe is allowed to change state.
    if (this.breaker.state === 'open') {
      return null
    }

    if (!outcome.leaseValid) {
      // Preempted by another worker; it owns the outcome. No platform signal.
      return null
    }

    const { result } = outcome

    // Success, a superseded write, or a dead line item all imply a working
    // connection to the platform → healthy.
    if (result.ok || result.category === 'superseded' || result.category === 'lineitem_dead') {
      const recovery = this.breaker.state !== 'closed'
      this.close()
      return {
        kind: 'healthy',
        recovery,
        lineitem_id: outcome.lineitem_id,
        deployment_id: outcome.deployment_id,
      }
    }

    // A malformed request is this line item's problem (a coding/data bug), not
    // the platform's — back off the item (already done) but don't pause.
    if (result.category === 'malformed') {
      return null
    }

    // rate_limit / platform_token / platform_config / transient / unknown → trip.
    return this.trip(result.category === 'rate_limit' ? 'rate-limited' : 'degraded', {
      lineitem_id: outcome.lineitem_id,
      deployment_id: outcome.deployment_id,
      category: result.category,
      http_status: result.status,
      detail: result.description,
    })
  }

  private trip(
    status: 'degraded' | 'rate-limited',
    item?: {
      lineitem_id: string
      deployment_id: string
      category: string
      http_status?: number
      detail: string
    }
  ): HealthAction {
    this.breaker.consecutiveFailures += 1
    const backoff = computeBackoffMs(this.config, this.breaker.consecutiveFailures)
    this.breaker.state = 'open'
    this.breaker.until = Date.now() + backoff

    this.logger.debug(
      {
        issuer: this.submitter.issuer,
        status,
        backoff_ms: Math.round(backoff),
        consecutive_failures: this.breaker.consecutiveFailures,
      },
      'score submission breaker tripped'
    )

    return {
      kind: 'fault',
      status,
      until: this.breaker.until,
      consecutiveFailures: this.breaker.consecutiveFailures,
      ...item,
    }
  }

  private close(): void {
    if (this.breaker.state !== 'closed') {
      this.logger.info({ issuer: this.submitter.issuer }, 'score submission breaker closed')
    }
    this.breaker.state = 'closed'
    this.breaker.until = 0
    this.breaker.consecutiveFailures = 0
  }

  private async persistHealth(action: HealthAction): Promise<void> {
    const now = new Date()
    const issuer = this.submitter.issuer

    if (action.kind === 'healthy') {
      await this.mutations.setPlatformHealth(issuer, now, {
        status: 'healthy',
        paused_until: null,
        last_success_at: now,
        consecutive_failures: 0,
      })
      return
    }

    await this.mutations.setPlatformHealth(issuer, now, {
      status: action.status,
      paused_until: new Date(action.until),
      last_failure_at: now,
      consecutive_failures: action.consecutiveFailures,
    })
    await this.mutations.recordSubmissionFailure({
      id: uuidv7(),
      platform_issuer: issuer,
      deployment_id: action.deployment_id,
      lineitem_id: action.lineitem_id,
      occurred_at: now,
      category: action.category ?? 'unknown',
      http_status: action.http_status,
      detail: action.detail,
    })
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
