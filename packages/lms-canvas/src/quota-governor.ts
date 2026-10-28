import type { RateLimitReading } from './types.js'

/**
 * Per-platform concurrency governor driven by Canvas's rate-limit quota headers.
 *
 * It maps observed quota into an allowed concurrency in `[1, maxConcurrency]`:
 * roughly "how many requests fit in the remaining quota, minus a reserve". The
 * quota bucket is shared per developer key, and each `remaining` reading already
 * reflects the *global* bucket level, so reacting to it implicitly responds to
 * pressure from other processes too (though independent governors can still
 * collectively over-target — cross-process coordination is out of scope).
 *
 * Design points:
 * - **Cold start at 1** and ramp up as ample quota is observed.
 * - **Conservative aggregation**: target off the *minimum* `remaining` and the
 *   *maximum* `cost` seen in a recent window, since concurrent readings race.
 * - **Fast down, slow up**: drop to the computed target immediately when quota
 *   tightens, but raise the effective target by at most +1 per ramp interval.
 * - **Reset on rate-limit**: a 403 returns the governor to cold start so it
 *   re-earns concurrency conservatively.
 *
 * Pure and synchronous — unit-testable by passing explicit `now` values.
 */
export class QuotaGovernor {
  private window: RateLimitReading[] = []
  private currentTarget = 1
  private lastRaiseAt: number

  constructor(
    private readonly maxConcurrency: number,
    private readonly reserveRequests: number,
    private readonly windowMs: number,
    private readonly rampIntervalMs: number,
    now: number = Date.now()
  ) {
    this.lastRaiseAt = now
  }

  /** Record a quota reading from a submission response. */
  record(reading: RateLimitReading): void {
    this.window.push(reading)
    this.reconcile(reading.at)
  }

  /** Return the governor to cold start (concurrency 1, no history). */
  reset(now: number = Date.now()): void {
    this.window = []
    this.currentTarget = 1
    this.lastRaiseAt = now
  }

  /** The currently allowed concurrency, in `[1, maxConcurrency]`. */
  target(now: number = Date.now()): number {
    this.reconcile(now)
    return this.currentTarget
  }

  private reconcile(now: number): void {
    this.prune(now)

    const computed = this.computedTarget()
    if (computed == null) {
      // No usable readings (cold start, or window aged out): hold steady.
      return
    }

    if (computed < this.currentTarget) {
      // Fast down: tighten immediately.
      this.currentTarget = computed
    } else if (computed > this.currentTarget && now - this.lastRaiseAt >= this.rampIntervalMs) {
      // Slow up: at most +1 per ramp interval.
      this.currentTarget += 1
      this.lastRaiseAt = now
    }
  }

  private prune(now: number): void {
    // Readings can arrive slightly out of order under concurrency, so filter the
    // whole (small) window rather than assuming the head is oldest.
    const cutoff = now - this.windowMs
    this.window = this.window.filter((reading) => reading.at >= cutoff)
  }

  /**
   * The concurrency the current readings support, or `undefined` if we can't yet
   * tell (no readings, or no cost observed). Uses the worst recent `remaining`
   * and the priciest recent `cost` for safety.
   */
  private computedTarget(): number | undefined {
    if (this.window.length === 0) {
      return undefined
    }

    let minRemaining = Number.POSITIVE_INFINITY
    let maxCost = 0
    for (const reading of this.window) {
      if (reading.remaining < minRemaining) {
        minRemaining = reading.remaining
      }
      if (reading.cost != null && reading.cost > maxCost) {
        maxCost = reading.cost
      }
    }

    if (maxCost <= 0) {
      return undefined
    }

    const capacity = Math.floor(minRemaining / maxCost) - this.reserveRequests
    return Math.min(this.maxConcurrency, Math.max(1, capacity))
  }
}
