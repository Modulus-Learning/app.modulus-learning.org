import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { and, eq } from 'drizzle-orm'

import { lineitems, progress } from '@/database/schema/index.js'
import { deferred, waitFor } from '@/test-support/async.js'
import { seedLineItem, seedProgress, seedScenario } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'

let h: TestHarness

before(async () => {
  h = await setupTestHarness()
})

after(async () => {
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

// float4 columns round-trip with ~7 significant digits; compare with tolerance.
const approx = (actual: number | undefined, expected: number, eps = 1e-4): void => {
  assert.ok(actual != null && Math.abs(actual - expected) <= eps, `${actual} ≈ ${expected}`)
}

const readProgress = (userId: string, activityId: string) =>
  h.db.query.progress.findFirst({
    where: and(eq(progress.user_id, userId), eq(progress.activity_id, activityId)),
  })

const readLineItem = (id: string) => h.db.query.lineitems.findFirst({ where: eq(lineitems.id, id) })

describe('updateProgress (monotonic high-water mark)', () => {
  it('creates a row: updated=true, increase is the full value', async () => {
    const s = await seedScenario(h.db)
    const r = await h.repos.activityMutations.updateProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.4,
    })
    assert.equal(r.updated, true)
    approx(r.increase, 0.4)
    approx(r.progress, 0.4)
  })

  it('advances the mark: updated=true, increase is the delta', async () => {
    const s = await seedScenario(h.db)
    await seedProgress(h.db, s.userId, s.activityId, 0.3)

    const r = await h.repos.activityMutations.updateProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.7,
    })
    assert.equal(r.updated, true)
    approx(r.increase, 0.4)
    approx(r.progress, 0.7)
  })

  it('ignores a lower submission: GREATEST keeps the mark, updated=false, increase=0', async () => {
    const s = await seedScenario(h.db)
    await seedProgress(h.db, s.userId, s.activityId, 0.7)

    const r = await h.repos.activityMutations.updateProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.5,
    })
    assert.equal(r.updated, false)
    approx(r.increase, 0)
    approx(r.progress, 0.7)
  })

  it('clamps to [0, 1]', async () => {
    const s = await seedScenario(h.db)
    const high = await h.repos.activityMutations.updateProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 1.5,
    })
    approx(high.progress, 1)
  })
})

describe('incrementProgress (cumulative target)', () => {
  it('creates and adds; increased=true', async () => {
    const s = await seedScenario(h.db)
    const r = await h.repos.activityMutations.incrementProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      amount: 0.3,
    })
    assert.equal(r.increased, true)
    approx(r.progress, 0.3)
  })

  it('accumulates and caps at 1.0 via LEAST', async () => {
    const s = await seedScenario(h.db)
    await seedProgress(h.db, s.userId, s.activityId, 0.8)

    const r = await h.repos.activityMutations.incrementProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      amount: 0.5,
    })
    assert.equal(r.increased, true)
    approx(r.progress, 1)
  })

  it('is a no-op for a zero amount: increased=false', async () => {
    const s = await seedScenario(h.db)
    await seedProgress(h.db, s.userId, s.activityId, 0.4)

    const r = await h.repos.activityMutations.incrementProgress({
      user_id: s.userId,
      activity_id: s.activityId,
      amount: 0,
    })
    assert.equal(r.increased, false)
    approx(r.progress, 0.4)
  })
})

describe('updateLineItems (ingestion scheduling)', () => {
  it('raises submittable_progress via GREATEST and never lowers it', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.3,
      submitted_progress: 0.3,
      submission_eligible_at: null,
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.6,
      submitted_at: new Date(),
    })
    approx((await readLineItem(li.id))?.submittable_progress, 0.6)

    // A lower ingestion value cannot pull the mark back down.
    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.4,
      submitted_at: new Date(),
    })
    approx((await readLineItem(li.id))?.submittable_progress, 0.6)
  })

  it('preserves an existing eligibility while backlog is already present (CASE true branch)', async () => {
    const s = await seedScenario(h.db)
    const existingEligible = new Date('2026-01-01T00:00:00Z')
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.6,
      submitted_progress: 0.2,
      submission_eligible_at: existingEligible,
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.7,
      submitted_at: new Date(),
    })

    const row = await readLineItem(li.id)
    approx(row?.submittable_progress, 0.7)
    assert.equal(
      row?.submission_eligible_at?.getTime(),
      existingEligible.getTime(),
      'existing eligibility preserved (COALESCE)'
    )
  })

  it('sets eligibility to now when backlog is present but eligibility was null', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.6,
      submitted_progress: 0.2,
      submission_eligible_at: null,
    })

    const before = Date.now()
    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.7,
      submitted_at: new Date(),
    })

    const eligible = (await readLineItem(li.id))?.submission_eligible_at
    assert.ok(eligible && eligible.getTime() >= before - 1000, 'eligibility stamped ~now')
  })

  it('keeps a future eligibility when the item was caught up (CASE else branch, GREATEST)', async () => {
    const s = await seedScenario(h.db)
    const future = new Date(Date.now() + 600_000)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.3,
      submitted_progress: 0.3,
      submission_eligible_at: future,
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.5,
      submitted_at: new Date(),
    })

    const row = await readLineItem(li.id)
    approx(row?.submittable_progress, 0.5)
    assert.equal(
      row?.submission_eligible_at?.getTime(),
      future.getTime(),
      'a future eligibility is not pulled earlier by ingestion'
    )
  })

  it('does not touch a line item whose cutoff precedes the submission', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.3,
      cutoff_at: new Date('2026-01-01T00:00:00Z'),
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.9,
      submitted_at: new Date('2026-02-01T00:00:00Z'), // after the cutoff
    })
    approx((await readLineItem(li.id))?.submittable_progress, 0.3, 1e-4)
  })

  it('updates a line item whose cutoff is at or after the submission', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.3,
      cutoff_at: new Date('2026-03-01T00:00:00Z'),
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.9,
      submitted_at: new Date('2026-02-01T00:00:00Z'), // before the cutoff
    })
    approx((await readLineItem(li.id))?.submittable_progress, 0.9)
  })

  it('does not touch a dead line item', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.3,
      dead_at: new Date(),
    })

    await h.repos.activityMutations.updateLineItems({
      user_id: s.userId,
      activity_id: s.activityId,
      progress: 0.9,
      submitted_at: new Date(),
    })
    approx((await readLineItem(li.id))?.submittable_progress, 0.3, 1e-4)
  })
})

describe('acquireUserLock (per-user serialization)', () => {
  it('serializes two concurrent transactions for the same user', async () => {
    const s = await seedScenario(h.db)
    const order: string[] = []
    const hold = deferred()

    const t1 = h.tx.withTransaction(async () => {
      await h.repos.activityMutations.acquireUserLock(s.userId)
      order.push('t1-acquired')
      await hold.promise
      order.push('t1-releasing')
    })

    await waitFor(() => order.includes('t1-acquired'))

    let t2Acquired = false
    const t2 = h.tx.withTransaction(async () => {
      await h.repos.activityMutations.acquireUserLock(s.userId)
      t2Acquired = true
      order.push('t2-acquired')
    })

    // While t1 holds the lock, t2 must not get past acquireUserLock.
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(t2Acquired, false, 't2 blocked while t1 holds the same-user lock')

    hold.resolve()
    await Promise.all([t1, t2])

    assert.equal(t2Acquired, true)
    assert.deepEqual(order, ['t1-acquired', 't1-releasing', 't2-acquired'])
  })

  it('does not block transactions for different users', async () => {
    const a = await seedScenario(h.db)
    const b = await seedScenario(h.db)
    const hold = deferred()

    let aAcquired = false
    let bAcquired = false

    const ta = h.tx.withTransaction(async () => {
      await h.repos.activityMutations.acquireUserLock(a.userId)
      aAcquired = true
      await hold.promise
    })

    await waitFor(() => aAcquired)

    const tb = h.tx.withTransaction(async () => {
      await h.repos.activityMutations.acquireUserLock(b.userId)
      bAcquired = true
    })

    // b acquires its own key even though a's transaction is still open.
    await waitFor(() => bAcquired)
    assert.equal(bAcquired, true)

    hold.resolve()
    await Promise.all([ta, tb])
  })
})
