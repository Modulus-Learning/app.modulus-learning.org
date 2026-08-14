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

describe('ActivityProgressService.setProgress — atomic rejection', () => {
  it('rolls the whole transaction back when an umbrella target is self-referential', async () => {
    const s = await seedScenario(h.db)

    await assert.rejects(
      h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
        progress_for_current_page: 0.6,
        // The reporting activity naming itself is a static authoring error.
        increments_for_other_pages: [{ url: s.activityUrl, factor: 0.5 }],
      })
    )

    // The self write from step 1 must not have survived the rejection.
    assert.equal(await readProgress(s.userId, s.activityId), undefined, 'self progress rolled back')
    const events = await eventsFor(s.userId, s.activityId)
    assert.equal(events.length, 0, 'no event survived the rolled-back transaction')
  })

  it('rolls back when an umbrella target URL exceeds the length limit', async () => {
    const s = await seedScenario(h.db)
    const tooLong = `https://content.test/${'x'.repeat(300)}`

    await assert.rejects(
      h.services.activityProgress.setProgress(authFor(s.userId, s.activityId), {
        progress_for_current_page: 0.6,
        increments_for_other_pages: [{ url: tooLong, factor: 0.5 }],
      })
    )

    assert.equal(await readProgress(s.userId, s.activityId), undefined, 'self progress rolled back')
  })
})
