import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { lineitems } from '@/database/schema/index.js'
import { seedLineItem, seedProgressEvent, seedScenario } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { ClaimedLineItem } from '@/modules/app/lti/score-submission/repository.js'

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

describe('claimNextEligibleLineItem', () => {
  it('claims an eligible line item and stamps a fresh lease', async () => {
    const scenario = await seedScenario(h.db)
    const seeded = await seedLineItem(h.db, scenario, {
      submittable_progress: 0.5,
      submitted_progress: 0,
    })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)

    assert.ok(claimed, 'a line item was claimed')
    assert.equal(claimed.id, seeded.id)
    assert.ok(claimed.submission_lease_token, 'lease token stamped')
    assert.ok(
      claimed.submission_lease_expires_at && claimed.submission_lease_expires_at > new Date(),
      'lease expiry set in the future'
    )

    // The lease is persisted, not just returned.
    const persisted = await readLineItem(seeded.id)
    assert.equal(persisted?.submission_lease_token, claimed.submission_lease_token)
  })

  it('does not claim a dead line item', async () => {
    const scenario = await seedScenario(h.db)
    await seedLineItem(h.db, scenario, { dead_at: new Date() })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(claimed, undefined)
  })

  it('does not claim a line item with no unsubmitted progress', async () => {
    const scenario = await seedScenario(h.db)
    await seedLineItem(h.db, scenario, { submittable_progress: 0.4, submitted_progress: 0.4 })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(claimed, undefined)
  })

  it('does not claim a line item whose eligibility is in the future', async () => {
    const scenario = await seedScenario(h.db)
    await seedLineItem(h.db, scenario, {
      submission_eligible_at: new Date(Date.now() + 60_000),
    })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(claimed, undefined)
  })

  it('does not claim a line item whose lease is still held', async () => {
    const scenario = await seedScenario(h.db)
    await seedLineItem(h.db, scenario, {
      submission_lease_expires_at: new Date(Date.now() + 60_000),
      submission_lease_token: uuidv7(),
    })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(claimed, undefined)
  })

  it('re-claims a line item whose lease has expired', async () => {
    const scenario = await seedScenario(h.db)
    const seeded = await seedLineItem(h.db, scenario, {
      submission_lease_expires_at: new Date(Date.now() - 60_000),
      submission_lease_token: uuidv7(),
    })

    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(claimed?.id, seeded.id)
  })

  it('claims the oldest-eligible line item first', async () => {
    const scenario = await seedScenario(h.db)
    const older = await seedLineItem(h.db, scenario, {
      lineitem_url: 'https://canvas.test/lineitems/older',
      submission_eligible_at: new Date(Date.now() - 120_000),
    })
    const newer = await seedLineItem(h.db, scenario, {
      lineitem_url: 'https://canvas.test/lineitems/newer',
      submission_eligible_at: new Date(Date.now() - 60_000),
    })

    const first = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(first?.id, older.id)

    const second = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(second?.id, newer.id)

    const third = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(third, undefined)
  })

  it('skips a row locked by another transaction (SKIP LOCKED)', async () => {
    const scenario = await seedScenario(h.db)
    const locked = await seedLineItem(h.db, scenario, {
      lineitem_url: 'https://canvas.test/lineitems/locked',
      submission_eligible_at: new Date(Date.now() - 120_000),
    })
    const free = await seedLineItem(h.db, scenario, {
      lineitem_url: 'https://canvas.test/lineitems/free',
      submission_eligible_at: new Date(Date.now() - 60_000),
    })

    // Hold a row lock on the oldest-eligible item in a separate session.
    const client = await h.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM lti_lineitems WHERE id = $1 FOR UPDATE', [locked.id])

      // The claim runs on the pool (a different session); SKIP LOCKED must make
      // it pass over the locked row and take the next-oldest instead.
      const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
      assert.equal(claimed?.id, free.id, 'skipped the locked row, took the next')

      await client.query('ROLLBACK')
    } finally {
      client.release()
    }

    // Once the lock is gone the previously-locked row is claimable.
    const afterUnlock = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.equal(afterUnlock?.id, locked.id)
  })
})

describe('fenced submission writes', () => {
  const claimFresh = async (): Promise<{
    scenario: Awaited<ReturnType<typeof seedScenario>>
    claimed: ClaimedLineItem
  }> => {
    const scenario = await seedScenario(h.db)
    await seedLineItem(h.db, scenario, { submittable_progress: 0.5, submitted_progress: 0.1 })
    const claimed = await h.repos.scoreMutations.claimNextEligibleLineItem(scenario.issuer, 30)
    assert.ok(claimed, 'precondition: claimed a line item')
    return { scenario, claimed }
  }

  const staleToken = (claimed: ClaimedLineItem): ClaimedLineItem => ({
    ...claimed,
    submission_lease_token: uuidv7(),
  })

  it('markSubmissionSuccess advances the mark, clears errors, releases the lease', async () => {
    const { claimed } = await claimFresh()

    const ok = await h.repos.scoreMutations.markSubmissionSuccess(claimed, 300)
    assert.equal(ok, true)

    const row = await readLineItem(claimed.id)
    assert.equal(row?.submitted_progress, claimed.submittable_progress)
    assert.equal(row?.submission_lease_token, null)
    assert.equal(row?.submission_lease_expires_at, null)
    assert.equal(row?.submission_error_count, 0)
    assert.equal(row?.submission_error_category, null)
    assert.ok(row?.submitted_at, 'submitted_at stamped')
    assert.ok(
      row?.submission_eligible_at && row.submission_eligible_at > new Date(),
      'throttled forward'
    )
  })

  it('markSubmissionSuccess is a no-op under a stale lease token (fencing)', async () => {
    const { claimed } = await claimFresh()

    const ok = await h.repos.scoreMutations.markSubmissionSuccess(staleToken(claimed), 300)
    assert.equal(ok, false)

    const row = await readLineItem(claimed.id)
    assert.equal(row?.submitted_progress, 0.1, 'submitted mark untouched')
    assert.equal(row?.submission_lease_token, claimed.submission_lease_token, 'lease untouched')
  })

  it('markSubmissionFailure increments the error count and backs off; stale token no-ops', async () => {
    const { claimed } = await claimFresh()

    const ok = await h.repos.scoreMutations.markSubmissionFailure(
      claimed,
      'server_error',
      'boom',
      5000
    )
    assert.equal(ok, true)

    const row = await readLineItem(claimed.id)
    assert.equal(row?.submission_error_count, 1)
    assert.equal(row?.submission_error_category, 'server_error')
    assert.equal(row?.submission_error_message, 'boom')
    assert.equal(row?.submission_lease_token, null, 'lease released')
    assert.ok(
      row?.submission_eligible_at && row.submission_eligible_at > new Date(),
      'backed off into the future'
    )

    const staleOk = await h.repos.scoreMutations.markSubmissionFailure(
      staleToken(claimed),
      'server_error',
      'again',
      5000
    )
    assert.equal(staleOk, false)
    const after = await readLineItem(claimed.id)
    assert.equal(after?.submission_error_count, 1, 'stale attempt did not double-count')
  })

  it('markSubmissionDead marks the row dead; stale token no-ops', async () => {
    const { claimed } = await claimFresh()

    const ok = await h.repos.scoreMutations.markSubmissionDead(claimed, 'invalid', 'permanent')
    assert.equal(ok, true)

    const row = await readLineItem(claimed.id)
    assert.ok(row?.dead_at, 'dead_at stamped')
    assert.equal(row?.submission_eligible_at, null)
    assert.equal(row?.submission_lease_token, null)
    assert.equal(row?.submission_error_count, 1)

    const staleOk = await h.repos.scoreMutations.markSubmissionDead(staleToken(claimed), 'x', 'y')
    assert.equal(staleOk, false)
  })
})

describe('getProgressAtCutoff', () => {
  it('returns the high-water mark at or before the cutoff', async () => {
    const scenario = await seedScenario(h.db)
    const base = new Date('2026-01-01T00:00:00Z')
    const at = (hours: number) => new Date(base.getTime() + hours * 3_600_000)

    await seedProgressEvent(h.db, scenario.userId, scenario.activityId, 0.2, at(-2))
    await seedProgressEvent(h.db, scenario.userId, scenario.activityId, 0.5, at(-1))
    await seedProgressEvent(h.db, scenario.userId, scenario.activityId, 0.8, at(1))

    const atCutoff = await h.repos.scoreQueries.getProgressAtCutoff(
      scenario.userId,
      scenario.activityId,
      base
    )
    assert.equal(atCutoff, 0.5, 'the post-cutoff 0.8 event is excluded')
  })

  it('returns 0 when there is no history at or before the cutoff', async () => {
    const scenario = await seedScenario(h.db)
    const value = await h.repos.scoreQueries.getProgressAtCutoff(
      scenario.userId,
      scenario.activityId,
      new Date()
    )
    assert.equal(value, 0)
  })
})
