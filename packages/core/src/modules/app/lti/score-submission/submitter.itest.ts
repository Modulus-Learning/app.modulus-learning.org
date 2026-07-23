import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { lineitems } from '@/database/schema/index.js'
import { deadResult, FakeLtiAgsClient, retryableResult, successResult } from '@/test-support/ags.js'
import { seedLineItem, seedScenario } from '@/test-support/fixtures.js'
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

const readLineItem = (id: string) => h.db.query.lineitems.findFirst({ where: eq(lineitems.id, id) })

// Force a claimed line item to look eligible again (as if its backoff elapsed),
// so a second processOne pass will re-claim it without a real wait.
const makeEligibleNow = (id: string) =>
  h.db
    .update(lineitems)
    .set({ submission_eligible_at: new Date(Date.now() - 60_000) })
    .where(eq(lineitems.id, id))

describe('LtiScoreSubmitter.processOne', () => {
  it('is idle when nothing is eligible, and never calls the AGS client', async () => {
    const s = await seedScenario(h.db)
    await seedLineItem(h.db, s, { dead_at: new Date() }) // present but not claimable
    const fake = new FakeLtiAgsClient({ issuer: s.issuer })

    const outcome = await h.services.makeSubmitter(fake).processOne()

    assert.equal(outcome.type, 'idle')
    assert.equal(fake.calls.length, 0, 'no publish attempt when the queue is empty')
  })

  it('records a success under the claimed lease and surfaces the rate-limit reading', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0.5,
      submitted_progress: 0.1,
    })
    const fake = new FakeLtiAgsClient({
      issuer: s.issuer,
      result: successResult,
      reading: { remaining: 90, cost: 2, at: Date.now() },
    })

    const outcome = await h.services.makeSubmitter(fake).processOne()

    assert.equal(outcome.type, 'submitted')
    assert.equal(outcome.type === 'submitted' && outcome.leaseValid, true)
    assert.equal(outcome.type === 'submitted' && outcome.reading?.remaining, 90)
    assert.equal(fake.calls[0]?.scoreGiven, 0.5, 'published the submittable high-water mark')

    const row = await readLineItem(li.id)
    approxEqual(row?.submitted_progress, 0.5)
    assert.equal(row?.submission_lease_token, null, 'lease released')
    assert.equal(row?.submission_error_count, 0)
    assert.ok(
      row?.submission_eligible_at && row.submission_eligible_at > new Date(),
      'throttled forward'
    )
  })

  it('records a retryable failure and backs off; a second pass increments the error count', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, { submittable_progress: 0.5, submitted_progress: 0 })
    const fake = new FakeLtiAgsClient({ issuer: s.issuer, result: retryableResult })
    const submitter = h.services.makeSubmitter(fake)

    await submitter.processOne()
    let row = await readLineItem(li.id)
    assert.equal(row?.submission_error_count, 1)
    assert.equal(row?.submission_error_category, 'transient')
    assert.equal(row?.submission_lease_token, null, 'lease released after failure')
    assert.ok(
      row?.submission_eligible_at && row.submission_eligible_at > new Date(),
      'backed off into the future'
    )

    // Simulate the backoff elapsing, then fail again.
    await makeEligibleNow(li.id)
    await submitter.processOne()
    row = await readLineItem(li.id)
    assert.equal(row?.submission_error_count, 2, 'consecutive failures accumulate')
  })

  it('retires a line item on a dead outcome', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, { submittable_progress: 0.5, submitted_progress: 0 })
    const fake = new FakeLtiAgsClient({ issuer: s.issuer, result: deadResult })
    const submitter = h.services.makeSubmitter(fake)

    const outcome = await submitter.processOne()
    assert.equal(outcome.type === 'submitted' && outcome.leaseValid, true)

    const row = await readLineItem(li.id)
    assert.ok(row?.dead_at, 'dead_at stamped')

    // A dead item is no longer eligible: the next pass finds nothing.
    const next = await submitter.processOne()
    assert.equal(next.type, 'idle')
  })

  it('no-ops the write when the lease is stolen mid-publish (fencing => leaseValid=false)', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, { submittable_progress: 0.5, submitted_progress: 0.1 })
    const stolenToken = uuidv7()

    // While "Canvas" is being called, another worker re-claims the line item:
    // rotate its lease token out from under us before recordResult runs.
    const fake = new FakeLtiAgsClient({
      issuer: s.issuer,
      result: successResult,
      onPublish: async () => {
        await h.db
          .update(lineitems)
          .set({
            submission_lease_token: stolenToken,
            submission_lease_expires_at: new Date(Date.now() + 60_000),
          })
          .where(eq(lineitems.id, li.id))
      },
    })

    const outcome = await h.services.makeSubmitter(fake).processOne()

    assert.equal(outcome.type === 'submitted' && outcome.leaseValid, false, 'fenced out')
    const row = await readLineItem(li.id)
    approxEqual(row?.submitted_progress, 0.1, 'our success write did not land')
    assert.equal(row?.submission_lease_token, stolenToken, 'the other worker still owns the lease')
  })
})

function approxEqual(actual: number | undefined, expected: number, msg?: string): void {
  assert.ok(actual != null && Math.abs(actual - expected) <= 1e-4, msg ?? `${actual} ≈ ${expected}`)
}
