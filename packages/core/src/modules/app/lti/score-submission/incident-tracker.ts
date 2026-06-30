import { v7 as uuidv7 } from 'uuid'

import { computeBackoffMs } from './submitter.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type {
  IncidentAggregateUpdate,
  IncidentInsert,
  IncidentRecord,
  PlatformHealthUpdate,
  SubmissionFailureInsert,
} from './repository.js'

export type BreakerState = 'closed' | 'open' | 'half_open'

/** A failure normalized for the tracker (Canvas-side, our-bug, or internal). */
export type FailureInfo = {
  category: string
  lineitem_id?: string
  deployment_id?: string
  http_status?: number
  detail?: string
}

/** A clean round-trip (success / superseded / lineitem_dead): resets the run. */
export type CleanInfo = {
  lineitem_id?: string
  deployment_id?: string
}

/**
 * Declarative DB intents the driver executes (FIFO, in emission order) against
 * the repository. Keeping them ordered is load-bearing: a failure row must exist
 * before it is backfilled, and an incident must exist before a later failure
 * references it.
 */
export type IncidentEffect =
  | { kind: 'logFailure'; failure: SubmissionFailureInsert }
  | { kind: 'openIncident'; incident: IncidentInsert }
  | { kind: 'backfillFailures'; incidentId: string; failureIds: string[] }
  | { kind: 'updateIncident'; id: string; fields: IncidentAggregateUpdate }
  | { kind: 'closeIncident'; id: string; resolvedAt: Date }
  | { kind: 'setHealth'; at: Date; data: PlatformHealthUpdate }

type OpenIncident = {
  id: string
  openedAt: number
  lastFailureAt: number
  failureCount: number
  // Distinct affected line items: `baseDistinct` carries a count adopted from a
  // persisted incident across restart (whose id-set we can't reconstruct), plus
  // the ids seen this process session. May slightly over-count across a restart.
  baseDistinct: number
  distinctIds: Set<string>
  categories: Set<string>
  severity: 'high' | 'low'
  triggerCategory: string
  successesSinceLastFailure: number
}

/**
 * In-memory circuit breaker + incident detector for a single platform.
 *
 * Pure and synchronous: callers fold outcomes in (`recordClean` / `recordFailure`),
 * advance time (`tick`), or reconcile a persisted incident on startup (`adopt`),
 * and each returns the ordered DB effects to persist. The breaker is the fast
 * hysteresis (trips at K consecutive non-clean round-trips, clears on one
 * success); the incident is the slow envelope (opens on the trip, spans the
 * breaker's flapping, resolves only on sustained recovery).
 */
export class IncidentTracker {
  private breakerState: BreakerState = 'closed'
  private breakerUntil = 0
  private consecutiveFailures = 0

  // Pre-declaration failure run (only populated while no incident is open).
  private runBuffer: {
    failureId: string
    lineitemId?: string
    category: string
    occurredAt: number
  }[] = []

  private incident: OpenIncident | null = null

  private readonly tripThreshold: number
  private readonly quietWindowMs: number
  private readonly minSuccesses: number
  private readonly hardCapMs: number

  constructor(
    private readonly issuer: string,
    private readonly config: Config,
    private readonly logger?: CoreLogger,
    private readonly genId: () => string = uuidv7
  ) {
    const ss = config.lti.score_submission
    this.tripThreshold = Math.max(1, ss.incident_trip_threshold)
    this.quietWindowMs = ss.recovery_quiet_window_seconds * 1000
    this.minSuccesses = ss.recovery_min_successes
    this.hardCapMs = ss.recovery_hard_cap_seconds * 1000
  }

  /** Current breaker state + pause expiry, for the driver's pacing loop. */
  get breaker(): { state: BreakerState; until: number } {
    return { state: this.breakerState, until: this.breakerUntil }
  }

  /** Promote a drained, expired `open` breaker to a single-probe `half_open`. */
  promoteToHalfOpen(): void {
    if (this.breakerState === 'open') {
      this.breakerState = 'half_open'
      this.logger?.info({ issuer: this.issuer }, 'score submission breaker half-open')
    }
  }

  /** Fold a clean round-trip: reset the run; close the breaker; maybe recover. */
  recordClean(_info: CleanInfo, now: number): IncidentEffect[] {
    const effects: IncidentEffect[] = []

    this.runBuffer = []
    this.consecutiveFailures = 0

    if (this.breakerState !== 'closed') {
      this.breakerState = 'closed'
      this.breakerUntil = 0
      this.logger?.info({ issuer: this.issuer }, 'score submission breaker closed')
      effects.push({
        kind: 'setHealth',
        at: new Date(now),
        data: {
          status: 'healthy',
          paused_until: null,
          last_success_at: new Date(now),
          consecutive_failures: 0,
        },
      })
    }

    if (this.incident) {
      this.incident.successesSinceLastFailure += 1
      if (this.shouldClose(now)) {
        effects.push(...this.closeIncidentEffects(now))
      }
    }

    return effects
  }

  /** Fold a failure: log it, advance the breaker, declare/extend the incident. */
  recordFailure(info: FailureInfo, now: number): IncidentEffect[] {
    const effects: IncidentEffect[] = []
    const failureId = this.genId()

    effects.push({
      kind: 'logFailure',
      failure: {
        id: failureId,
        platform_issuer: this.issuer,
        incident_id: this.incident?.id ?? null,
        lineitem_id: info.lineitem_id,
        deployment_id: info.deployment_id,
        occurred_at: new Date(now),
        category: info.category,
        http_status: info.http_status,
        detail: info.detail,
      },
    })

    this.consecutiveFailures += 1
    const isRateLimit = info.category === 'rate_limit'
    const trip = isRateLimit || this.consecutiveFailures >= this.tripThreshold

    if (this.incident) {
      // Attribute directly to the open incident and extend the envelope.
      this.incident.failureCount += 1
      this.incident.lastFailureAt = now
      this.incident.successesSinceLastFailure = 0
      if (info.lineitem_id) {
        this.incident.distinctIds.add(info.lineitem_id)
      }
      this.incident.categories.add(info.category)
      this.incident.severity = this.severityFor(this.incident.categories)
      effects.push({ kind: 'updateIncident', id: this.incident.id, fields: this.aggregates() })
      if (trip) {
        effects.push(...this.tripBreaker(isRateLimit, now))
      }
    } else {
      // Buffer the pre-declaration run; the K-th failure declares.
      this.runBuffer.push({
        failureId,
        lineitemId: info.lineitem_id,
        category: info.category,
        occurredAt: now,
      })
      if (trip) {
        effects.push(...this.declareIncident(info, isRateLimit, now))
      }
    }

    return effects
  }

  /** Time-based check (call each loop tick): close a sufficiently-recovered incident. */
  tick(now: number): IncidentEffect[] {
    if (this.incident && this.shouldClose(now)) {
      return this.closeIncidentEffects(now)
    }
    return []
  }

  /**
   * Reconcile a persisted open incident on startup. If it has been quiet longer
   * than the hard cap it is closed immediately (an orphan from a crash);
   * otherwise it is adopted and recovery tracking resumes.
   */
  adopt(row: IncidentRecord, now: number): IncidentEffect[] {
    const lastFailureAt = row.last_failure_at.getTime()
    if (now - lastFailureAt >= this.hardCapMs) {
      return [
        { kind: 'closeIncident', id: row.id, resolvedAt: new Date(now) },
        { kind: 'setHealth', at: new Date(now), data: { open_incident_id: null } },
      ]
    }
    this.incident = {
      id: row.id,
      openedAt: row.opened_at.getTime(),
      lastFailureAt,
      failureCount: row.failure_count,
      baseDistinct: row.distinct_affected_lineitems,
      distinctIds: new Set(),
      categories: new Set(row.categories_seen ?? []),
      severity: row.severity === 'low' ? 'low' : 'high',
      triggerCategory: row.trigger_category,
      successesSinceLastFailure: 0,
    }
    this.logger?.info(
      { issuer: this.issuer, incident_id: row.id },
      'adopted open incident on startup'
    )
    return []
  }

  // --- internals -------------------------------------------------------------

  private declareIncident(info: FailureInfo, isRateLimit: boolean, now: number): IncidentEffect[] {
    const id = this.genId()
    const distinctIds = new Set<string>()
    const categories = new Set<string>()
    for (const entry of this.runBuffer) {
      if (entry.lineitemId) {
        distinctIds.add(entry.lineitemId)
      }
      categories.add(entry.category)
    }

    this.incident = {
      id,
      openedAt: this.runBuffer[0]?.occurredAt ?? now,
      lastFailureAt: now,
      failureCount: this.runBuffer.length,
      baseDistinct: 0,
      distinctIds,
      categories,
      severity: this.severityFor(categories),
      triggerCategory: info.category,
      successesSinceLastFailure: 0,
    }
    const failureIds = this.runBuffer.map((e) => e.failureId)
    this.runBuffer = []

    this.openBreaker(isRateLimit, now)
    this.logger?.info(
      {
        issuer: this.issuer,
        incident_id: id,
        trigger_category: info.category,
        failure_count: this.incident.failureCount,
        distinct_lineitems: this.distinctCount(),
      },
      'incident opened'
    )

    return [
      { kind: 'openIncident', incident: this.incidentRow() },
      { kind: 'backfillFailures', incidentId: id, failureIds },
      this.faultHealth(isRateLimit, now, id),
    ]
  }

  private tripBreaker(isRateLimit: boolean, now: number): IncidentEffect[] {
    this.openBreaker(isRateLimit, now)
    return [this.faultHealth(isRateLimit, now)]
  }

  private openBreaker(isRateLimit: boolean, now: number): void {
    const backoff = computeBackoffMs(this.config, this.consecutiveFailures)
    this.breakerState = 'open'
    this.breakerUntil = now + backoff
    this.logger?.debug(
      {
        issuer: this.issuer,
        rate_limited: isRateLimit,
        backoff_ms: Math.round(backoff),
        consecutive_failures: this.consecutiveFailures,
      },
      'score submission breaker tripped'
    )
  }

  private closeIncidentEffects(now: number): IncidentEffect[] {
    const id = this.incident?.id
    this.logger?.info({ issuer: this.issuer, incident_id: id }, 'incident resolved')
    this.incident = null
    if (!id) {
      return []
    }
    return [
      { kind: 'closeIncident', id, resolvedAt: new Date(now) },
      { kind: 'setHealth', at: new Date(now), data: { open_incident_id: null } },
    ]
  }

  private shouldClose(now: number): boolean {
    if (!this.incident) {
      return false
    }
    const quiet = now - this.incident.lastFailureAt
    if (quiet >= this.hardCapMs) {
      return true
    }
    return (
      quiet >= this.quietWindowMs && this.incident.successesSinceLastFailure >= this.minSuccesses
    )
  }

  private severityFor(categories: Set<string>): 'high' | 'low' {
    for (const c of categories) {
      if (c !== 'rate_limit') {
        return 'high'
      }
    }
    return 'low'
  }

  private distinctCount(): number {
    return this.incident ? this.incident.baseDistinct + this.incident.distinctIds.size : 0
  }

  private aggregates(): IncidentAggregateUpdate {
    const inc = this.incident!
    return {
      last_failure_at: new Date(inc.lastFailureAt),
      failure_count: inc.failureCount,
      distinct_affected_lineitems: this.distinctCount(),
      categories_seen: [...inc.categories],
      severity: inc.severity,
    }
  }

  private incidentRow(): IncidentInsert {
    const inc = this.incident!
    return {
      id: inc.id,
      platform_issuer: this.issuer,
      opened_at: new Date(inc.openedAt),
      last_failure_at: new Date(inc.lastFailureAt),
      severity: inc.severity,
      trigger_category: inc.triggerCategory,
      categories_seen: [...inc.categories],
      failure_count: inc.failureCount,
      distinct_affected_lineitems: this.distinctCount(),
    }
  }

  private faultHealth(isRateLimit: boolean, now: number, openIncidentId?: string): IncidentEffect {
    const data: PlatformHealthUpdate = {
      status: isRateLimit ? 'rate-limited' : 'degraded',
      paused_until: new Date(this.breakerUntil),
      last_failure_at: new Date(now),
      consecutive_failures: this.consecutiveFailures,
    }
    if (openIncidentId) {
      data.open_incident_id = openIncidentId
    }
    return { kind: 'setHealth', at: new Date(now), data }
  }
}
