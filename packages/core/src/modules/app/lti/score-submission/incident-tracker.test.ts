import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { IncidentTracker } from './incident-tracker.js'
import type { Config } from '@/config.js'
import type { IncidentEffect } from './incident-tracker.js'
import type { IncidentRecord } from './repository.js'

// --- harness ----------------------------------------------------------------

// Small, fast thresholds so recovery/hard-cap are reachable in a few ms of
// virtual time. Trip at 3 keeps the buffered-run assertions short.
const makeConfig = (over: Partial<Config['lti']['score_submission']> = {}): Config =>
  ({
    lti: {
      score_submission: {
        incident_trip_threshold: 3,
        recovery_quiet_window_seconds: 1, // 1_000ms
        recovery_min_successes: 3,
        recovery_hard_cap_seconds: 10, // 10_000ms
        backoff_base_seconds: 1,
        backoff_error_cap: 5,
        ...over,
      },
    },
  }) as unknown as Config

// Deterministic id generator so failure/incident ids are assertable.
const seqIds = () => {
  let n = 0
  return () => `id-${n++}`
}

const makeTracker = (
  over: Partial<Config['lti']['score_submission']> = {},
  genId: () => string = seqIds()
) => new IncidentTracker('https://canvas.test', makeConfig(over), undefined, genId)

const kinds = (effects: IncidentEffect[]): string[] => effects.map((e) => e.kind)

function findKind<K extends IncidentEffect['kind']>(
  effects: IncidentEffect[],
  kind: K
): Extract<IncidentEffect, { kind: K }> | undefined {
  return effects.find((e): e is Extract<IncidentEffect, { kind: K }> => e.kind === kind)
}

const fail = (over: { category?: string; lineitem_id?: string } = {}) => ({
  category: over.category ?? 'transient',
  lineitem_id: over.lineitem_id,
})

// --- breaker ----------------------------------------------------------------

describe('IncidentTracker — breaker', () => {
  it('stays closed below the trip threshold, then opens on the K-th failure', () => {
    const t = makeTracker()
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 1)
    assert.equal(t.breaker.state, 'closed', 'still closed at K-1 failures')

    const effects = t.recordFailure(fail(), 2)
    assert.equal(t.breaker.state, 'open', 'opens on the K-th')
    assert.ok(t.breaker.until > 2, 'pause expiry is in the future')
    assert.ok(kinds(effects).includes('openIncident'), 'the trip opens an incident')
  })

  it('trips on the very first rate_limit failure', () => {
    const t = makeTracker()
    const effects = t.recordFailure(fail({ category: 'rate_limit' }), 0)
    assert.equal(t.breaker.state, 'open')
    const open = findKind(effects, 'openIncident')
    assert.ok(open, 'a rate_limit incident opens immediately')
    assert.equal(open.incident.failure_count, 1)
    assert.equal(open.incident.severity, 'low', 'pure rate_limit is low severity')
  })

  it('a clean round-trip resets the consecutive-failure run', () => {
    const t = makeTracker()
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 1)
    t.recordClean({}, 2)
    // The counter reset means two more failures must NOT trip.
    t.recordFailure(fail(), 3)
    const effects = t.recordFailure(fail(), 4)
    assert.equal(t.breaker.state, 'closed', 'run was reset, no trip yet')
    assert.equal(kinds(effects).includes('openIncident'), false)
  })

  it('promoteToHalfOpen only acts on an open breaker', () => {
    const t = makeTracker()
    t.promoteToHalfOpen()
    assert.equal(t.breaker.state, 'closed', 'no-op while closed')

    t.recordFailure(fail({ category: 'rate_limit' }), 0)
    assert.equal(t.breaker.state, 'open')
    t.promoteToHalfOpen()
    assert.equal(t.breaker.state, 'half_open')
  })

  it('half-open: a probe failure re-opens a normally-tripped breaker', () => {
    // A normal trip leaves consecutiveFailures at the threshold, so the next
    // (probe) failure crosses it again and re-opens. (A rate_limit trip sits at
    // 1, so it instead takes K-1 failing probes to re-open — see note below.)
    const t = makeTracker()
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 1)
    t.recordFailure(fail(), 2)
    assert.equal(t.breaker.state, 'open')
    t.promoteToHalfOpen()
    t.recordFailure(fail(), 100)
    assert.equal(t.breaker.state, 'open', 'a probe failure re-opens the breaker')
  })

  it('half-open after a rate_limit trip: a single non-rate_limit probe holds half-open', () => {
    // Documents the asymmetry: a rate_limit trips at consecutiveFailures=1, so a
    // lone transient probe (count 2 < K) does not re-open.
    const t = makeTracker()
    t.recordFailure(fail({ category: 'rate_limit' }), 0)
    t.promoteToHalfOpen()
    t.recordFailure(fail(), 100)
    assert.equal(t.breaker.state, 'half_open')
    // A second rate_limit probe, however, re-opens immediately.
    t.recordFailure(fail({ category: 'rate_limit' }), 200)
    assert.equal(t.breaker.state, 'open')
  })

  it('half-open: one clean closes', () => {
    const t = makeTracker()
    t.recordFailure(fail({ category: 'rate_limit' }), 0)
    t.promoteToHalfOpen()
    const effects = t.recordClean({}, 100)
    assert.equal(t.breaker.state, 'closed', 'a probe success closes the breaker')
    const health = findKind(effects, 'setHealth')
    assert.ok(health)
    assert.equal(health.data.status, 'healthy')
    assert.equal(health.data.paused_until, null)
  })
})

// --- incident declaration ---------------------------------------------------

describe('IncidentTracker — incident declaration', () => {
  it('backdates opened_at to the first failure and backfills the buffered run', () => {
    const t = makeTracker({}, seqIds())
    t.recordFailure(fail(), 100)
    t.recordFailure(fail(), 200)
    const effects = t.recordFailure(fail(), 300)

    const open = findKind(effects, 'openIncident')
    const backfill = findKind(effects, 'backfillFailures')
    assert.ok(open && backfill)
    assert.equal(
      open.incident.opened_at.getTime(),
      100,
      'opened_at is the first failure of the triggering run'
    )
    assert.equal(open.incident.last_failure_at.getTime(), 300)
    assert.equal(open.incident.failure_count, 3)
    // Failure ids are id-0..id-2 (one per recordFailure); the incident id is id-3.
    assert.deepEqual(backfill.failureIds, ['id-0', 'id-1', 'id-2'])
    assert.equal(backfill.incidentId, 'id-3')
    assert.equal(open.incident.id, 'id-3')
  })

  it('severity is high when the triggering run contains a non-rate_limit category', () => {
    // Two transients buffer (no early trip), then a rate_limit forces the trip;
    // the declared incident spans both categories, so severity is high.
    const t = makeTracker()
    t.recordFailure(fail({ category: 'transient' }), 0)
    t.recordFailure(fail({ category: 'transient' }), 1)
    const effects = t.recordFailure(fail({ category: 'rate_limit' }), 2)
    const open = findKind(effects, 'openIncident')
    assert.ok(open)
    assert.equal(open.incident.severity, 'high')
    assert.deepEqual([...(open.incident.categories_seen ?? [])].sort(), ['rate_limit', 'transient'])
  })

  it('counts distinct affected line items', () => {
    const t = makeTracker()
    t.recordFailure(fail({ lineitem_id: 'a' }), 0)
    t.recordFailure(fail({ lineitem_id: 'a' }), 1)
    const effects = t.recordFailure(fail({ lineitem_id: 'b' }), 2)
    const open = findKind(effects, 'openIncident')
    assert.ok(open)
    assert.equal(open.incident.distinct_affected_lineitems, 2)
  })

  it('attributes post-declaration failures to the open incident without re-opening', () => {
    const t = makeTracker({}, seqIds())
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 1)
    const opened = t.recordFailure(fail(), 2)
    const incidentId = findKind(opened, 'openIncident')!.incident.id

    // One clean closes the breaker but leaves the incident open.
    t.recordClean({}, 3)
    // A fresh run of failures must extend the SAME incident — no second open.
    const more = [
      t.recordFailure(fail(), 4),
      t.recordFailure(fail(), 5),
      t.recordFailure(fail(), 6),
    ]
    const flat = more.flat()
    assert.equal(kinds(flat).includes('openIncident'), false, 'no second incident')
    const update = findKind(flat, 'updateIncident')
    assert.ok(update)
    assert.equal(update.id, incidentId, 'updates target the original incident')
    assert.equal(t.breaker.state, 'open', 'the re-trip re-opened the breaker')
  })
})

// --- recovery ---------------------------------------------------------------

describe('IncidentTracker — recovery', () => {
  const openIncident = (t: IncidentTracker) => {
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 0)
    t.recordFailure(fail(), 0)
  }

  it('does NOT resolve on the single clean that closes the breaker', () => {
    const t = makeTracker()
    openIncident(t)
    const effects = t.recordClean({}, 100)
    assert.equal(t.breaker.state, 'closed', 'breaker closes immediately')
    assert.equal(kinds(effects).includes('closeIncident'), false, 'incident stays open')
  })

  it('resolves after the quiet window AND the minimum successes', () => {
    const t = makeTracker() // quiet 1_000ms, min 3 successes
    openIncident(t) // last failure at t=0
    assert.equal(kinds(t.recordClean({}, 100)).includes('closeIncident'), false) // succ 1
    assert.equal(kinds(t.recordClean({}, 200)).includes('closeIncident'), false) // succ 2
    // succ 3 but still inside the quiet window → not yet.
    assert.equal(kinds(t.recordClean({}, 300)).includes('closeIncident'), false)
    // Past the quiet window with enough successes → resolve.
    const effects = t.recordClean({}, 1_100)
    assert.ok(kinds(effects).includes('closeIncident'), 'resolves on sustained recovery')
    const health = findKind(effects, 'setHealth')
    assert.ok(health)
    assert.equal(health.data.open_incident_id, null)
  })

  it('resolves via tick at the hard cap regardless of successes', () => {
    const t = makeTracker() // hard cap 10_000ms
    openIncident(t) // last failure at t=0, zero successes
    assert.deepEqual(t.tick(9_999), [], 'before the hard cap, nothing')
    const effects = t.tick(10_000)
    assert.ok(kinds(effects).includes('closeIncident'), 'hard cap forces resolution')
  })
})

// --- startup reconciliation -------------------------------------------------

describe('IncidentTracker — adopt', () => {
  const row = (over: Partial<IncidentRecord> = {}): IncidentRecord =>
    ({
      id: 'persisted-1',
      platform_issuer: 'https://canvas.test',
      opened_at: new Date(0),
      last_failure_at: new Date(0),
      resolved_at: null,
      severity: 'high',
      trigger_category: 'transient',
      categories_seen: ['transient'],
      failure_count: 4,
      distinct_affected_lineitems: 2,
      notified_at: null,
      resolved_notified_at: null,
      open_incident_id: null,
      created_at: new Date(0),
      updated_at: new Date(0),
      ...over,
    }) as unknown as IncidentRecord

  it('adopts a recent incident and attributes new failures to it', () => {
    const t = makeTracker()
    const now = 5_000
    const adoptEffects = t.adopt(row({ last_failure_at: new Date(now) }), now)
    assert.deepEqual(adoptEffects, [], 'adoption itself persists nothing')

    const effects = t.recordFailure(fail(), now + 1)
    assert.equal(kinds(effects).includes('openIncident'), false, 'no new incident opened')
    const update = findKind(effects, 'updateIncident')
    assert.ok(update)
    assert.equal(update.id, 'persisted-1', 'failure attributed to the adopted incident')
    // baseDistinct (2) carries over; this failure has no lineitem so it stays 2.
    assert.equal(update.fields.distinct_affected_lineitems, 2)
  })

  it('hard-cap-closes an orphaned incident instead of adopting it', () => {
    const t = makeTracker() // hard cap 10_000ms
    const now = 100_000
    const effects = t.adopt(row({ last_failure_at: new Date(now - 10_001) }), now)
    assert.deepEqual(kinds(effects), ['closeIncident', 'setHealth'])
    const close = findKind(effects, 'closeIncident')
    assert.ok(close)
    assert.equal(close.id, 'persisted-1')
    // Not adopted: a subsequent failure starts a fresh buffered run, no update to the old id.
    const next = t.recordFailure(fail(), now)
    assert.equal(kinds(next).includes('updateIncident'), false)
  })
})
