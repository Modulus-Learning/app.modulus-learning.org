import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  DEFAULT_SCOPE_ID,
  lineitems,
  progress,
  progressEvents,
} from '@/database/schema/index.js'
import { AgentAuth } from '@/lib/auth.js'
import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import { seedActivity, seedLineItem, seedScenario, seedScope } from '@/test-support/fixtures.js'
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

/**
 * Adds one enabled whole-origin allowlist rule.
 *
 * Every unseen cumulative target now goes through the sitewide policy, so a
 * test that expects one to be admitted has to say which origin it trusts.
 */
const seedRule = async (origin = 'https://content.test'): Promise<void> => {
  await h.repos.allowlistMutations.createRule({ id: uuidv7(), origin, path_prefix: '/' })
}

// renew_after is irrelevant to setProgress; 0 keeps the fixtures terse.
const authFor = (userId: string, activityId: string, scopeId: string = DEFAULT_SCOPE_ID) =>
  new AgentAuth(userId, activityId, scopeId, 0)

const approx = (actual: number | undefined, expected: number, eps = 1e-4): void => {
  assert.ok(actual != null && Math.abs(actual - expected) <= eps, `${actual} ≈ ${expected}`)
}

const readProgress = (userId: string, activityId: string, scopeId: string = DEFAULT_SCOPE_ID) =>
  h.db.query.progress.findFirst({
    where: and(
      eq(progress.user_id, userId),
      eq(progress.activity_id, activityId),
      eq(progress.scope_id, scopeId)
    ),
  })

const readLineItem = (id: string) => h.db.query.lineitems.findFirst({ where: eq(lineitems.id, id) })

const eventsFor = (userId: string, activityId: string, scopeId: string = DEFAULT_SCOPE_ID) =>
  h.db
    .select()
    .from(progressEvents)
    .where(
      and(
        eq(progressEvents.user_id, userId),
        eq(progressEvents.activity_id, activityId),
        eq(progressEvents.scope_id, scopeId)
      )
    )

describe('ActivityProgressService.setProgress — policy reads', () => {
  it('does not read policy for a self-only progress advance', async (t) => {
    const s = await seedScenario(h.db)
    const reads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')
    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [],
    })
    approx(result.progress, 0.4)
    assert.equal(reads.mock.callCount(), 0)
  })

  it('does not read policy for grandfathered or self-referencing targets', async (t) => {
    const s = await seedScenario(h.db)
    const targetUrl = 'https://grandfathered.test/umbrella'
    await seedActivity(h.db, targetUrl)
    const reads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')
    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [
        { url: targetUrl, factor: 0.5 },
        { url: s.activityUrl, factor: 0.5 },
      ],
    })
    approx(result.others?.[0]?.progress, 0.2)
    assert.deepEqual(result.rejected_targets, [{ url: s.activityUrl, reason: 'self_reference' }])
    assert.equal(reads.mock.callCount(), 0)
  })

  it('loads one snapshot for unseen targets and reads a fresh policy on the next submission', async (t) => {
    const s = await seedScenario(h.db)
    await seedRule('https://other.test')
    const ruleId = uuidv7()
    await h.repos.allowlistMutations.createRule({
      id: ruleId,
      origin: 'https://content.test',
      path_prefix: '/',
    })
    const auth = authFor(s.userId, s.activityId)
    const reads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')
    const result = await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [
        { url: 'https://content.test/first', factor: 0.5 },
        { url: 'https://content.test/second', factor: 0.5 },
        { url: 'https://denied.test/third', factor: 0.5 },
      ],
    })
    assert.equal(reads.mock.callCount(), 1)
    assert.equal(result.others?.length, 2)
    assert.deepEqual(result.rejected_targets, [
      { url: 'https://denied.test/third', reason: 'activity_url_not_allowed' },
    ])

    await h.repos.allowlistMutations.updateRule(ruleId, { is_enabled: false })
    const next = await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: 'https://content.test/fourth', factor: 0.5 }],
    })
    assert.equal(reads.mock.callCount(), 2)
    assert.deepEqual(next.rejected_targets, [
      { url: 'https://content.test/fourth', reason: 'activity_url_not_allowed' },
    ])
  })
})

describe('ActivityProgressService.setProgress — self write fan-out', () => {
  it('advances self, records exactly one event, and schedules the self line item', async () => {
    const s = await seedScenario(h.db)
    const li = await seedLineItem(h.db, s, {
      submittable_progress: 0,
      submitted_progress: 0,
      submission_eligible_at: null,
    })

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [],
    })

    approx(result.progress, 0.4)
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.4)

    const events = await eventsFor(s.userId, s.activityId)
    assert.equal(events.length, 1, 'one progress event on the advance')
    assert.equal(events[0]?.source_activity_id, null, 'a self submission has no source activity')

    const row = await readLineItem(li.id)
    approx(row?.submittable_progress, 0.4, 1e-4)
    assert.ok(row?.submission_eligible_at, 'line item scheduled for submission')
  })

  it('is idempotent on a no-advance retry: no second event, no extra nudge', async () => {
    const s = await seedScenario(h.db)
    const auth = authFor(s.userId, s.activityId)

    await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [],
    })
    const second = await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [],
    })

    approx(second.progress, 0.4)
    const events = await eventsFor(s.userId, s.activityId)
    assert.equal(events.length, 1, 'the identical resubmission recorded no new event')
  })

  it('suppresses the event when a lower value follows a higher one', async () => {
    const s = await seedScenario(h.db)
    const auth = authFor(s.userId, s.activityId)

    await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.7,
      increments_for_other_pages: [],
    })
    const lower = await h.services.activityProgress.setProgress(auth, {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [],
    })

    approx(lower.progress, 0.7, 1e-4)
    const events = await eventsFor(s.userId, s.activityId)
    assert.equal(events.length, 1, 'the lower resubmission held the mark and logged nothing')
  })
})

describe('ActivityProgressService.setProgress — umbrella fan-out', () => {
  it('applies Δself × factor to the target and records a contribution event', async () => {
    const s = await seedScenario(h.db)
    const targetUrl = `https://content.test/target-${uuidv7()}`
    const targetActivityId = await seedActivity(h.db, targetUrl)

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: targetUrl, factor: 0.5 }],
    })

    // Δself = 0.5 (from 0); contribution = 0.5 × 0.5 = 0.25.
    approx(result.others?.[0]?.progress, 0.25)
    approx((await readProgress(s.userId, targetActivityId))?.progress, 0.25)

    const targetEvents = await eventsFor(s.userId, targetActivityId)
    assert.equal(targetEvents.length, 1)
    assert.equal(
      targetEvents[0]?.source_activity_id,
      s.activityId,
      'contribution event points back at the reporting activity'
    )
  })

  it('contributes nothing on a no-advance retry (Δself = 0)', async () => {
    const s = await seedScenario(h.db)
    const targetUrl = `https://content.test/target-${uuidv7()}`
    const targetActivityId = await seedActivity(h.db, targetUrl)
    const auth = authFor(s.userId, s.activityId)
    const request = {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: targetUrl, factor: 0.5 }],
    }

    await h.services.activityProgress.setProgress(auth, request)
    await h.services.activityProgress.setProgress(auth, request) // Δself = 0

    approx((await readProgress(s.userId, targetActivityId))?.progress, 0.25)
    const targetEvents = await eventsFor(s.userId, targetActivityId)
    assert.equal(targetEvents.length, 1, 'the retry added no contribution and no event')
  })

  it('lazily creates a target activity on first contact with an unseen URL', async () => {
    const s = await seedScenario(h.db)
    await seedRule()
    const targetUrl = `https://content.test/unseen-${uuidv7()}`

    await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: targetUrl, factor: 1 }],
    })

    const created = await h.db.query.activities.findFirst({ where: eq(activities.url, targetUrl) })
    assert.ok(created, 'the unseen umbrella target was created')
  })
})

describe('ActivityProgressService — scope partitioning', () => {
  it('reads and writes self progress only in the token scope', async () => {
    const s = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, s.platformId)
    const authA = authFor(s.userId, s.activityId)
    const authB = authFor(s.userId, s.activityId, scopeB)

    await h.services.activityProgress.setProgress(authA, {
      progress_for_current_page: 0.8,
      increments_for_other_pages: [],
    })
    await h.services.activityProgress.setProgress(authB, {
      progress_for_current_page: 0.3,
      increments_for_other_pages: [],
    })
    const lowerB = await h.services.activityProgress.setProgress(authB, {
      progress_for_current_page: 0.2,
      increments_for_other_pages: [],
    })

    approx(lowerB.progress, 0.3)
    approx((await h.services.activityProgress.getProgress(authA, {})).progress, 0.8)
    approx((await h.services.activityProgress.getProgress(authB, {})).progress, 0.3)
    assert.equal((await eventsFor(s.userId, s.activityId)).length, 1)
    assert.equal((await eventsFor(s.userId, s.activityId, scopeB)).length, 1)
  })

  it('keeps cumulative reads, increments, and events in the source token scope', async () => {
    const s = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, s.platformId)
    const targetUrl = `https://content.test/target-${uuidv7()}`
    const targetId = await seedActivity(h.db, targetUrl)
    await h.db.insert(progress).values({
      user_id: s.userId,
      activity_id: targetId,
      scope_id: DEFAULT_SCOPE_ID,
      progress: 1,
    })

    const result = await h.services.activityProgress.setProgress(
      authFor(s.userId, s.activityId, scopeB),
      {
        progress_for_current_page: 0.5,
        increments_for_other_pages: [{ url: targetUrl, factor: 0.5 }],
      }
    )

    approx(result.others?.[0]?.progress, 0.25)
    approx((await readProgress(s.userId, targetId))?.progress, 1)
    approx((await readProgress(s.userId, targetId, scopeB))?.progress, 0.25)
    assert.equal((await eventsFor(s.userId, targetId)).length, 0)
    const eventsB = await eventsFor(s.userId, targetId, scopeB)
    assert.equal(eventsB.length, 1)
    assert.equal(eventsB[0]?.source_activity_id, s.activityId)

    const readB = await h.services.activityProgress.getProgress(
      authFor(s.userId, s.activityId, scopeB),
      { urls: [targetUrl] }
    )
    approx(readB.others?.[0]?.progress, 0.25)
  })

  it('updates only matching-scope direct and cumulative line items', async () => {
    const s = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, s.platformId)
    const targetUrl = `https://content.test/target-${uuidv7()}`
    const targetId = await seedActivity(h.db, targetUrl)
    const selfLineItem = await seedLineItem(h.db, s, {
      submittable_progress: 0,
      submission_eligible_at: null,
    })
    const targetLineItem = await seedLineItem(
      h.db,
      { ...s, activityId: targetId },
      {
        submittable_progress: 0,
        submission_eligible_at: null,
      }
    )

    await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId, scopeB), {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: targetUrl, factor: 0.5 }],
    })

    approx((await readLineItem(selfLineItem.id))?.submittable_progress, 0)
    approx((await readLineItem(targetLineItem.id))?.submittable_progress, 0)
    assert.equal((await readLineItem(selfLineItem.id))?.submission_eligible_at, null)
    assert.equal((await readLineItem(targetLineItem.id))?.submission_eligible_at, null)
  })

  it('executes exactly one line-item statement for self and each cumulative target', async () => {
    const s = await seedScenario(h.db)
    const firstUrl = `https://content.test/target-${uuidv7()}`
    const secondUrl = `https://content.test/target-${uuidv7()}`
    await seedActivity(h.db, firstUrl)
    await seedActivity(h.db, secondUrl)
    const mutations = h.repos.activityMutations
    const original = mutations.updateLineItems.bind(mutations)
    let statements = 0
    mutations.updateLineItems = async (values) => {
      statements += 1
      return original(values)
    }

    try {
      await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
        progress_for_current_page: 0.6,
        increments_for_other_pages: [
          { url: firstUrl, factor: 0.5 },
          { url: secondUrl, factor: 0.5 },
        ],
      })
    } finally {
      mutations.updateLineItems = original
    }

    assert.equal(statements, 3)
  })
})

describe('ActivityProgressService.setProgress — concurrency', () => {
  it('serializes a concurrent create of the same unseen target (one row, both land)', async () => {
    const a = await seedScenario(h.db)
    const b = await seedScenario(h.db)
    await seedRule()
    const targetUrl = `https://content.test/shared-${uuidv7()}`

    await Promise.all([
      h.services.activityProgress.setProgress(authFor(a.userId, a.activityId), {
        progress_for_current_page: 0.5,
        increments_for_other_pages: [{ url: targetUrl, factor: 1 }],
      }),
      h.services.activityProgress.setProgress(authFor(b.userId, b.activityId), {
        progress_for_current_page: 0.5,
        increments_for_other_pages: [{ url: targetUrl, factor: 1 }],
      }),
    ])

    const rows = await h.db.select().from(activities).where(eq(activities.url, targetUrl))
    assert.equal(rows.length, 1, 'exactly one activities row despite the create race')

    const targetId = rows[0]?.id
    assert.ok(targetId)
    approx((await readProgress(a.userId, targetId))?.progress, 0.5)
    approx((await readProgress(b.userId, targetId))?.progress, 0.5)
  })

  it('serializes two same-user submissions without deadlock; both contributions land', async () => {
    const s = await seedScenario(h.db)
    const url1 = `https://content.test/t1-${uuidv7()}`
    const url2 = `https://content.test/t2-${uuidv7()}`
    const t1 = await seedActivity(h.db, url1)
    const t2 = await seedActivity(h.db, url2)
    const auth = authFor(s.userId, s.activityId)

    // Two concurrent same-user calls touching the two targets in opposite order:
    // without the in-tx advisory lock these could deadlock on the target rows.
    await Promise.all([
      h.services.activityProgress.setProgress(auth, {
        progress_for_current_page: 0.5,
        increments_for_other_pages: [
          { url: url1, factor: 1 },
          { url: url2, factor: 1 },
        ],
      }),
      h.services.activityProgress.setProgress(auth, {
        progress_for_current_page: 1,
        increments_for_other_pages: [
          { url: url2, factor: 1 },
          { url: url1, factor: 1 },
        ],
      }),
    ])

    // Self coalesces to the high-water mark; both targets received contribution.
    approx((await readProgress(s.userId, s.activityId))?.progress, 1)
    assert.ok(((await readProgress(s.userId, t1))?.progress ?? 0) > 0, 'target 1 advanced')
    assert.ok(((await readProgress(s.userId, t2))?.progress ?? 0) > 0, 'target 2 advanced')
  })

  it('serializes same-user progress transactions across scopes', async () => {
    const s = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, s.platformId)

    await Promise.all([
      h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
        progress_for_current_page: 0.4,
        increments_for_other_pages: [],
      }),
      h.services.activityProgress.setProgress(authFor(s.userId, s.activityId, scopeB), {
        progress_for_current_page: 0.7,
        increments_for_other_pages: [],
      }),
    ])

    approx((await readProgress(s.userId, s.activityId))?.progress, 0.4)
    approx((await readProgress(s.userId, s.activityId, scopeB))?.progress, 0.7)
  })
})

describe('ActivityProgressService.setProgress — per-target rejection', () => {
  // These two cases previously asserted that a bad target rolled the whole
  // transaction back. That was the defect being repaired, not a guard: the
  // target list comes from the page's authored markup, so the same bad URL
  // recurs in every submission that page makes. Failing the request would
  // permanently stop all progress from that page, including the learner's own
  // valid self high-water mark.

  it('commits self progress and reports a self-referential target', async () => {
    const s = await seedScenario(h.db)

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.6,
      // The reporting activity naming itself is a static authoring error.
      increments_for_other_pages: [{ url: s.activityUrl, factor: 0.5 }],
    })

    assert.deepEqual(result.rejected_targets, [{ url: s.activityUrl, reason: 'self_reference' }])
    approx(result.progress, 0.6)

    // Self committed, with its event.
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.6)
    assert.equal((await eventsFor(s.userId, s.activityId)).length, 1)
  })

  it('commits self progress and reports an over-long target url', async () => {
    const s = await seedScenario(h.db)
    const tooLong = `https://content.test/${'x'.repeat(300)}`
    await seedRule()

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: tooLong, factor: 0.5 }],
    })

    assert.deepEqual(result.rejected_targets, [{ url: tooLong, reason: 'url_too_long' }])
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.6)
    assert.equal(
      (await h.db.select().from(activities).where(eq(activities.url, tooLong))).length,
      0,
      'no activity row was created for a target that cannot be stored'
    )
  })
})

describe('ActivityProgressService.setProgress — allowlist on cumulative targets', () => {
  it('commits self progress and writes nothing at all for a disallowed target', async () => {
    // "Creates no data" is the contract, and one missing check would not catch
    // a partial write -- so all four tables are asserted.
    const s = await seedScenario(h.db)
    await seedRule()
    const denied = `https://elsewhere.test/umbrella-${uuidv7()}`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: denied, factor: 0.5 }],
    })

    assert.deepEqual(result.rejected_targets, [{ url: denied, reason: 'activity_url_not_allowed' }])
    assert.equal(result.others, undefined)

    // Self committed.
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.6)

    // ...and the target left no trace anywhere.
    const activityRows = await h.db.select().from(activities).where(eq(activities.url, denied))
    assert.equal(activityRows.length, 0, 'no activities row')

    const allProgress = await h.db.select().from(progress)
    assert.equal(allProgress.length, 1, 'only self has a progress row')

    const allEvents = await h.db.select().from(progressEvents)
    assert.equal(allEvents.length, 1, 'only self has an event')

    const allLineItems = await h.db.select().from(lineitems)
    assert.equal(allLineItems.length, 0, 'no line item was created for the refused target')
  })

  it('applies an allowed target and reports only the disallowed one', async () => {
    const s = await seedScenario(h.db)
    await seedRule()
    const allowed = `https://content.test/umbrella-${uuidv7()}`
    const denied = `https://elsewhere.test/umbrella-${uuidv7()}`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [
        { url: allowed, factor: 1 },
        { url: denied, factor: 1 },
      ],
    })

    assert.deepEqual(
      result.others?.map(({ url }) => url),
      [allowed]
    )
    assert.deepEqual(result.rejected_targets, [{ url: denied, reason: 'activity_url_not_allowed' }])

    const allowedRow = await h.db.query.activities.findFirst({
      where: eq(activities.url, allowed),
    })
    assert.ok(allowedRow, 'the allowed target was created')
    approx((await readProgress(s.userId, allowedRow.id))?.progress, 0.5)
  })

  it('contributes to a grandfathered target no current rule matches', async () => {
    // Grandfathered targets are *use*, not registration: the activity already
    // exists, so no policy applies to it.
    const s = await seedScenario(h.db)
    const grandfatheredUrl = `https://long-forgotten.test/umbrella-${uuidv7()}`
    const grandfatheredId = await seedActivity(h.db, grandfatheredUrl)
    // The only rule points somewhere else entirely.
    await seedRule('https://somewhere-else.test')

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: grandfatheredUrl, factor: 1 }],
    })

    assert.equal(result.rejected_targets, undefined)
    approx((await readProgress(s.userId, grandfatheredId))?.progress, 0.5)
  })

  it('omits rejected_targets entirely when every target is accepted', async () => {
    // Absent, not an empty array -- matching how `others` is already handled.
    const s = await seedScenario(h.db)
    await seedRule()

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: `https://content.test/umbrella-${uuidv7()}`, factor: 1 }],
    })

    assert.equal(result.rejected_targets, undefined)
    assert.ok(!('rejected_targets' in result) || result.rejected_targets === undefined)
  })

  it('reports nothing when self did not advance, even with a disallowed target', async () => {
    // Target evaluation stays conditional on self advancing: a submission with
    // nothing to contribute applies nothing to any target, so it has nothing to
    // report about them. A page with a bad target learns about it on the next
    // advance, and a no-op retry stays silent.
    const s = await seedScenario(h.db)
    await seedRule()
    const denied = `https://elsewhere.test/umbrella-${uuidv7()}`
    const request = {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: denied, factor: 0.5 }],
    }

    const first = await h.services.activityProgress.setProgress(
      authFor(s.userId, s.activityId),
      request
    )
    assert.deepEqual(first.rejected_targets, [{ url: denied, reason: 'activity_url_not_allowed' }])

    // Δself = 0 on the retry.
    const retry = await h.services.activityProgress.setProgress(
      authFor(s.userId, s.activityId),
      request
    )
    assert.equal(retry.rejected_targets, undefined)
  })

  it('reports a malformed target url without failing the submission', async () => {
    const s = await seedScenario(h.db)
    await seedRule()

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [{ url: 'javascript:alert(1)', factor: 0.5 }],
    })

    assert.deepEqual(result.rejected_targets, [
      { url: 'javascript:alert(1)', reason: 'malformed_url' },
    ])
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.6)
  })
})

describe('ActivityProgressService.getProgress — reads never register', () => {
  it('returns a grandfathered target and consults no policy', async () => {
    const s = await seedScenario(h.db)
    const grandfatheredUrl = `https://long-forgotten.test/umbrella-${uuidv7()}`
    const grandfatheredId = await seedActivity(h.db, grandfatheredUrl)
    await seedRule('https://somewhere-else.test')

    // Give the target some progress to read back.
    await h.repos.activityMutations.incrementProgress({
      activity_id: grandfatheredId,
      user_id: s.userId,
      scope_id: DEFAULT_SCOPE_ID,
      amount: 0.25,
    })

    // A read must not evaluate, create, or even look at the policy.
    let policyReads = 0
    const originalListEnabled = h.repos.allowlistQueries.listEnabledRules.bind(
      h.repos.allowlistQueries
    )
    h.repos.allowlistQueries.listEnabledRules = async () => {
      policyReads += 1
      return await originalListEnabled()
    }

    try {
      const result = await h.services.activityProgress.getProgress(
        authFor(s.userId, s.activityId),
        { urls: [grandfatheredUrl] }
      )

      assert.deepEqual(
        result.others?.map(({ url }) => url),
        [grandfatheredUrl]
      )
      approx(result.others?.[0]?.progress, 0.25)
      assert.equal(policyReads, 0, 'get-progress read the allowlist policy')
    } finally {
      h.repos.allowlistQueries.listEnabledRules = originalListEnabled
    }
  })

  it('creates no activity for an unknown url on read', async () => {
    const s = await seedScenario(h.db)
    const unknown = `https://elsewhere.test/never-seen-${uuidv7()}`

    const result = await h.services.activityProgress.getProgress(authFor(s.userId, s.activityId), {
      urls: [unknown],
    })

    assert.equal(result.others, undefined)
    assert.equal(
      (await h.db.select().from(activities).where(eq(activities.url, unknown))).length,
      0
    )
  })
})

describe('ActivityProgressService.getProgress — canonical reads', () => {
  it('answers each resolved occurrence in order with its requested spelling', async (t) => {
    const s = await seedScenario(h.db)
    const path = `/lesson-${uuidv7()}`
    const lessonUrl = `https://content.test${path}`
    const otherUrl = `https://content.test/other-${uuidv7()}`
    const lessonId = await seedActivity(h.db, lessonUrl)
    const otherId = await seedActivity(h.db, otherUrl)
    await seedRule('https://somewhere-else.test')
    for (const [activity_id, amount] of [
      [lessonId, 0.25],
      [otherId, 0.5],
    ] as const) {
      await h.repos.activityMutations.incrementProgress({
        activity_id,
        user_id: s.userId,
        scope_id: DEFAULT_SCOPE_ID,
        amount,
      })
    }
    const register = t.mock.method(h.services.activityRegistration, 'register')
    const loadPolicy = t.mock.method(h.services.activityRegistration, 'loadPolicy')
    const policyReads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')
    const lookups = t.mock.method(h.repos.activityQueries, 'findActivityByUrl')
    const activitiesBefore = (await h.db.select().from(activities)).length

    const variant = `HTTPS://CONTENT.TEST:443${path}?section=2`
    const unknownUrl = `https://elsewhere.test/unknown-${uuidv7()}`
    const result = await h.services.activityProgress.getProgress(authFor(s.userId, s.activityId), {
      urls: [lessonUrl, variant, 'not a url', unknownUrl, `${otherUrl}#part-2`, lessonUrl],
    })

    // Identical and equivalent occurrences are each answered; the malformed
    // and unknown inputs are omitted without disturbing the order of the rest.
    assert.deepEqual(result.others, [
      { url: lessonUrl, progress: 0.25 },
      { url: variant, progress: 0.25 },
      { url: `${otherUrl}#part-2`, progress: 0.5 },
      { url: lessonUrl, progress: 0.25 },
    ])

    // The lookups used canonical keys, and the malformed input made none.
    assert.deepEqual(
      lookups.mock.calls.map((call) => call.arguments[0]),
      [lessonUrl, lessonUrl, unknownUrl, otherUrl, lessonUrl]
    )

    assert.equal(register.mock.callCount(), 0)
    assert.equal(loadPolicy.mock.callCount(), 0)
    assert.equal(policyReads.mock.callCount(), 0)
    assert.equal((await h.db.select().from(activities)).length, activitiesBefore)
  })
})

describe('ActivityProgressService.setProgress — canonical targets', () => {
  it('contributes to the existing activity for an equivalent target spelling', async (t) => {
    const s = await seedScenario(h.db)
    const path = `/target-${uuidv7()}`
    const targetUrl = `https://content.test${path}`
    const targetId = await seedActivity(h.db, targetUrl)
    const policyReads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')
    const variant = `HTTPS://CONTENT.TEST:443/unit/..${path}?section=2#top`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: variant, factor: 0.5 }],
    })

    assert.deepEqual(result.others, [{ url: variant, progress: 0.25 }])
    assert.equal(result.rejected_targets, undefined)
    approx((await readProgress(s.userId, targetId))?.progress, 0.25)
    assert.equal((await eventsFor(s.userId, targetId)).length, 1)
    assert.equal((await h.db.select().from(activities)).length, 2, 'no activity was created')
    assert.equal(policyReads.mock.callCount(), 0, 'a known target needs no policy')
  })

  it('stores an unseen target under its canonical url and reports its submitted spelling', async () => {
    const s = await seedScenario(h.db)
    await seedRule()
    const path = `/unseen-${uuidv7()}`
    const variant = `HTTPS://CONTENT.TEST:443${path}?${'q'.repeat(300)}`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [{ url: variant, factor: 1 }],
    })

    // The query is not part of the stored activity, so it does not count
    // towards the 255-character bound.
    assert.equal(result.rejected_targets, undefined)
    assert.deepEqual(
      result.others?.map(({ url }) => url),
      [variant]
    )
    const created = await h.db.query.activities.findFirst({
      where: eq(activities.url, `https://content.test${path}`),
    })
    assert.ok(created, 'the target was stored under its canonical url')
    approx((await readProgress(s.userId, created.id))?.progress, 0.5)
  })

  it('rejects an equivalent self spelling while self and other targets commit', async (t) => {
    const s = await seedScenario(h.db)
    const otherUrl = `https://content.test/other-${uuidv7()}`
    const otherId = await seedActivity(h.db, otherUrl)
    const selfLineItem = await seedLineItem(h.db, s, {
      submittable_progress: 0,
      submission_eligible_at: null,
    })
    const updateLineItems = t.mock.method(h.repos.activityMutations, 'updateLineItems')
    const selfVariant = `${s.activityUrl.replace('https://content.test', 'https://Content.Test:443')}?x=1#y`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [
        { url: selfVariant, factor: 0.5 },
        { url: otherUrl, factor: 0.5 },
      ],
    })

    assert.deepEqual(result.rejected_targets, [{ url: selfVariant, reason: 'self_reference' }])
    assert.deepEqual(
      result.others?.map(({ url }) => url),
      [otherUrl]
    )

    // Self committed once, with no contribution added on top of its own mark.
    approx((await readProgress(s.userId, s.activityId))?.progress, 0.6)
    const selfEvents = await eventsFor(s.userId, s.activityId)
    assert.equal(selfEvents.length, 1)
    assert.equal(selfEvents[0]?.source_activity_id, null, 'no contribution event on self')
    approx((await readLineItem(selfLineItem.id))?.submittable_progress, 0.6)

    // The other target received its contribution.
    approx((await readProgress(s.userId, otherId))?.progress, 0.3)
    assert.equal((await eventsFor(s.userId, otherId)).length, 1)

    // One line-item update for self and one for the accepted target; none for
    // the self-reference, and no activity was created for it.
    assert.deepEqual(
      updateLineItems.mock.calls.map((call) => call.arguments[0].activity_id),
      [s.activityId, otherId]
    )
    assert.equal((await h.db.select().from(activities)).length, 2)
  })

  it('refuses malformed, over-long, and disallowed targets per target with one policy read', async (t) => {
    const s = await seedScenario(h.db)
    await seedRule()
    const knownUrl = `https://content.test/known-${uuidv7()}`
    const knownId = await seedActivity(h.db, knownUrl)
    const policyReads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')

    const firstUnseen = `HTTPS://CONTENT.TEST/first-${uuidv7()}?a=1`
    const secondUnseen = `https://content.test:443/second-${uuidv7()}#b`
    const tooLong = `https://content.test/${'x'.repeat(300)}?q=1`
    const denied = `https://elsewhere.test/denied-${uuidv7()}?q=1`

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [
        { url: firstUnseen, factor: 1 },
        { url: 'not a url', factor: 1 },
        { url: `${knownUrl}?c=1`, factor: 1 },
        { url: tooLong, factor: 1 },
        { url: secondUnseen, factor: 1 },
        { url: denied, factor: 1 },
      ],
    })

    assert.deepEqual(result.rejected_targets, [
      { url: 'not a url', reason: 'malformed_url' },
      { url: tooLong, reason: 'url_too_long' },
      { url: denied, reason: 'activity_url_not_allowed' },
    ])
    assert.deepEqual(
      result.others?.map(({ url }) => url),
      [firstUnseen, `${knownUrl}?c=1`, secondUnseen]
    )
    assert.equal(policyReads.mock.callCount(), 1, 'one snapshot shared by every unseen target')

    approx((await readProgress(s.userId, s.activityId))?.progress, 0.4)
    approx((await readProgress(s.userId, knownId))?.progress, 0.4)
    const stored = (await h.db.select().from(activities)).map(({ url }) => url).sort()
    assert.deepEqual(
      stored,
      [
        s.activityUrl,
        knownUrl,
        normalizeActivityUrl(firstUnseen),
        normalizeActivityUrl(secondUnseen),
      ].sort()
    )
  })

  it('reads no policy when every target is a known activity in another spelling', async (t) => {
    const s = await seedScenario(h.db)
    await seedRule('https://somewhere-else.test')
    const firstUrl = `https://content.test/first-${uuidv7()}`
    const secondUrl = `https://grandfathered.test/second-${uuidv7()}`
    await seedActivity(h.db, firstUrl)
    await seedActivity(h.db, secondUrl)
    const policyReads = t.mock.method(h.repos.allowlistQueries, 'listEnabledRules')

    const result = await h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [
        { url: firstUrl.replace('https://content.test', 'HTTPS://content.test:443'), factor: 1 },
        { url: `${secondUrl}?section=2`, factor: 1 },
      ],
    })

    assert.equal(result.rejected_targets, undefined)
    assert.equal(result.others?.length, 2)
    assert.equal(policyReads.mock.callCount(), 0)
  })
})
