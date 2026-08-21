import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodes,
  enrollment,
  progress,
  users,
} from '@/database/schema/index.js'
import { seedScenario, seedScope } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { ProgressRequest } from '../schemas.js'

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

const options = (
  overrides: Partial<ProgressRequest['options']> = {}
): ProgressRequest['options'] => ({
  page: 1,
  page_size: 25,
  order: 'updated_at',
  desc: true,
  ...overrides,
})

type SortableReportRow = {
  full_name: string | null
  progress: number | null
  updated_at: Date | null
}

type SortCase = {
  order: ProgressRequest['options']['order']
  asc: (string | number | null)[]
  desc: (string | number | null)[]
  value: (row: SortableReportRow) => string | number | null
}

const seedActivityCode = async (): Promise<string> => {
  const id = uuidv7()
  await h.db.insert(activityCodes).values({
    id,
    code: `code-${id}`,
    private_code: `private-${id}`,
  })
  return id
}

/** Inserts an activity, if it does not already exist, and returns its id. */
const seedActivity = async (activityId: string = uuidv7()): Promise<string> => {
  await h.db
    .insert(activities)
    .values({ id: activityId, url: `https://content.test/${activityId}` })
    .onConflictDoNothing()
  return activityId
}

/** Associates an activity with an activity code. */
const associateActivity = async (activityCodeId: string, activityId: string): Promise<void> => {
  await h.db
    .insert(activityActivityCode)
    .values({ activity_code_id: activityCodeId, activity_id: activityId })
    .onConflictDoNothing()
}

/**
 * Seeds one learner and, unless a switch says otherwise, one activity, its
 * association with an activity code, and the learner's enrollment in that code.
 * The switches exist so the exclusion cases -- an activity associated with
 * another code, a learner with progress but no enrollment -- can be expressed
 * without a second helper.
 */
const seedEnrollment = async ({
  activityCodeId,
  fullName,
  activityId = uuidv7(),
  associateWith = activityCodeId,
  enrolled = true,
}: {
  activityCodeId: string
  fullName: string | null
  activityId?: string
  /** The code the activity is associated with; defaults to the enrolled code. */
  associateWith?: string | null
  /** When false, the learner exists but is not enrolled in `activityCodeId`. */
  enrolled?: boolean
}): Promise<{ userId: string; activityId: string }> => {
  const userId = uuidv7()
  await h.db.insert(users).values({ id: userId, full_name: fullName })

  await seedActivity(activityId)

  if (associateWith != null) {
    await associateActivity(associateWith, activityId)
  }

  if (enrolled) {
    await h.db
      .insert(enrollment)
      .values({ activity_code_id: activityCodeId, user_id: userId })
      .onConflictDoNothing()
  }

  return { userId, activityId }
}

describe('ActivityQueries all-scope progress reporting', () => {
  it('aggregates across scopes and returns one row per enrolled learner and associated activity', async () => {
    const scenario = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, scenario.platformId)
    const activityCodeId = await seedActivityCode()
    const scoped = await seedEnrollment({
      activityCodeId,
      fullName: 'Scoped Learner',
    })
    const empty = await seedEnrollment({
      activityCodeId,
      fullName: 'No Progress Learner',
      activityId: scoped.activityId,
    })
    const secondActivityId = await seedActivity()
    await associateActivity(activityCodeId, secondActivityId)
    const early = new Date('2026-01-01T00:00:00Z')
    const middle = new Date('2026-01-03T00:00:00Z')
    const late = new Date('2026-01-08T00:00:00Z')

    await h.db.insert(progress).values([
      {
        user_id: scoped.userId,
        activity_id: scoped.activityId,
        progress: 0.4,
        created_at: middle,
        updated_at: middle,
      },
      {
        user_id: scoped.userId,
        activity_id: scoped.activityId,
        scope_id: scopeB,
        progress: 0.8,
        created_at: early,
        updated_at: late,
      },
    ])

    const rows = await h.repos.appActivityQueries.getActivityCodeProgress(activityCodeId, options())

    // Two enrolled learners x two associated activities.
    assert.equal(rows.length, 4)
    assert.equal(new Set(rows.map((row) => `${row.user_id}:${row.activity_id}`)).size, 4)
    assert.ok(rows.every((row) => row.total === 4))

    const scopedRow = rows.find(
      (row) => row.user_id === scoped.userId && row.activity_id === scoped.activityId
    )
    assert.equal(scopedRow?.progress, 0.8)
    assert.equal(scopedRow?.created_at?.getTime(), early.getTime())
    assert.equal(scopedRow?.updated_at?.getTime(), late.getTime())

    // The same learner, on the code's other associated activity, has no progress.
    const scopedSecondRow = rows.find(
      (row) => row.user_id === scoped.userId && row.activity_id === secondActivityId
    )
    assert.equal(scopedSecondRow?.progress, null)
    assert.equal(scopedSecondRow?.created_at, null)
    assert.equal(scopedSecondRow?.updated_at, null)

    const emptyRows = rows.filter((row) => row.user_id === empty.userId)
    assert.equal(emptyRows.length, 2)
    assert.ok(emptyRows.every((row) => row.progress == null))
    assert.ok(emptyRows.every((row) => row.created_at == null))
    assert.ok(emptyRows.every((row) => row.updated_at == null))
  })

  it('never reports an activity associated with a different activity code', async () => {
    const activityCodeId = await seedActivityCode()
    const otherActivityCodeId = await seedActivityCode()
    const learner = await seedEnrollment({ activityCodeId, fullName: 'Enrolled Learner' })
    const foreignActivityId = await seedActivity()
    await associateActivity(otherActivityCodeId, foreignActivityId)

    await h.db.insert(progress).values({
      user_id: learner.userId,
      activity_id: foreignActivityId,
      progress: 0.9,
    })

    const rows = await h.repos.appActivityQueries.getActivityCodeProgress(activityCodeId, options())

    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.activity_id, learner.activityId)
    assert.ok(rows.every((row) => row.activity_id !== foreignActivityId))
  })

  it('never reports progress for a learner who is not enrolled in the selected code', async () => {
    const activityCodeId = await seedActivityCode()
    const enrolled = await seedEnrollment({ activityCodeId, fullName: 'Enrolled Learner' })
    const outsider = await seedEnrollment({
      activityCodeId,
      fullName: 'Unenrolled Learner',
      activityId: enrolled.activityId,
      enrolled: false,
    })

    await h.db.insert(progress).values({
      user_id: outsider.userId,
      activity_id: enrolled.activityId,
      progress: 0.7,
    })

    const rows = await h.repos.appActivityQueries.getActivityCodeProgress(activityCodeId, options())

    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.user_id, enrolled.userId)
    assert.equal(rows[0]?.progress, null)
  })

  it('returns no rows for an associated activity with no enrolled learners', async () => {
    const activityCodeId = await seedActivityCode()
    const activityId = await seedActivity()
    await associateActivity(activityCodeId, activityId)

    const rows = await h.repos.appActivityQueries.getActivityCodeProgress(activityCodeId, options())

    assert.deepEqual(rows, [])
  })

  it('places null names, progress, and timestamps last in both directions', async () => {
    const activityCodeId = await seedActivityCode()
    const sharedActivityId = await seedActivity()
    const alpha = await seedEnrollment({
      activityCodeId,
      fullName: 'Alpha',
      activityId: sharedActivityId,
    })
    const zulu = await seedEnrollment({
      activityCodeId,
      fullName: 'Zulu',
      activityId: sharedActivityId,
    })
    await seedEnrollment({ activityCodeId, fullName: null, activityId: sharedActivityId })
    const alphaTime = new Date('2026-02-01T00:00:00Z')
    const zuluTime = new Date('2026-02-02T00:00:00Z')

    await h.db.insert(progress).values([
      {
        user_id: alpha.userId,
        activity_id: alpha.activityId,
        progress: 0.2,
        created_at: alphaTime,
        updated_at: alphaTime,
      },
      {
        user_id: zulu.userId,
        activity_id: zulu.activityId,
        progress: 0.8,
        created_at: zuluTime,
        updated_at: zuluTime,
      },
    ])

    const cases: SortCase[] = [
      {
        order: 'full_name' as const,
        asc: ['Alpha', 'Zulu', null],
        desc: ['Zulu', 'Alpha', null],
        value: (row: { full_name: string | null }) => row.full_name,
      },
      {
        order: 'progress' as const,
        asc: [0.2, 0.8, null],
        desc: [0.8, 0.2, null],
        value: (row: { progress: number | null }) => row.progress,
      },
      {
        order: 'updated_at' as const,
        asc: [alphaTime.getTime(), zuluTime.getTime(), null],
        desc: [zuluTime.getTime(), alphaTime.getTime(), null],
        value: (row: { updated_at: Date | null }) => row.updated_at?.getTime() ?? null,
      },
    ]

    for (const testCase of cases) {
      const ascending = await h.repos.appActivityQueries.getActivityCodeProgress(
        activityCodeId,
        options({ order: testCase.order, desc: false })
      )
      const descending = await h.repos.appActivityQueries.getActivityCodeProgress(
        activityCodeId,
        options({ order: testCase.order, desc: true })
      )

      assert.deepEqual(ascending.map(testCase.value), testCase.asc)
      assert.deepEqual(descending.map(testCase.value), testCase.desc)
      assert.ok(ascending.every((row) => row.total === 3))
      assert.ok(descending.every((row) => row.total === 3))
    }
  })

  it('uses stable ascending activity and user keys across adjacent pages when aggregates tie', async () => {
    const activityCodeId = await seedActivityCode()
    const sharedActivityId = await seedActivity()
    const enrollmentRows: { userId: string }[] = []
    for (let index = 0; index < 5; index++) {
      enrollmentRows.push(
        await seedEnrollment({
          activityCodeId,
          fullName: 'Same Name',
          activityId: sharedActivityId,
        })
      )
    }
    const expectedUserIds = enrollmentRows.map(({ userId }) => userId).sort()

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        h.repos.appActivityQueries.getActivityCodeProgress(
          activityCodeId,
          options({
            page,
            page_size: 2,
            order: 'full_name',
            desc: true,
          })
        )
      )
    )
    const flattened = pages.flat()

    assert.deepEqual(
      flattened.map(({ user_id }) => user_id),
      expectedUserIds
    )
    assert.equal(new Set(flattened.map(({ user_id }) => user_id)).size, 5)
    assert.ok(flattened.every((row) => row.total === 5))
  })
})

describe('ActivityMutations.enrollInActivityCode', () => {
  const readEnrollmentRows = async (activityCodeId: string, userId: string) =>
    await h.db.query.enrollment.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.activity_code_id, activityCodeId), eq(table.user_id, userId)),
    })

  it('is idempotent for a repeated launch and never rewrites created_at', async () => {
    const activityCodeId = await seedActivityCode()
    const userId = uuidv7()
    await h.db.insert(users).values({ id: userId, full_name: 'Returning Learner' })

    await h.repos.appActivityMutations.enrollInActivityCode(userId, activityCodeId)
    const [first] = await readEnrollmentRows(activityCodeId, userId)
    assert.ok(first != null)
    const originalCreatedAt = first.created_at

    // The second attempt must be observably later than the first, so an
    // accidental update to `created_at` would change the recorded value.
    await h.db.execute(sql`select pg_sleep(0.01)`)
    await h.repos.appActivityMutations.enrollInActivityCode(userId, activityCodeId)

    const rows = await readEnrollmentRows(activityCodeId, userId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.created_at.getTime(), originalCreatedAt.getTime())
  })

  it('leaves one unchanged row when a second activity under the same code is launched', async () => {
    const activityCodeId = await seedActivityCode()
    const userId = uuidv7()
    await h.db.insert(users).values({ id: userId, full_name: 'Multi Activity Learner' })
    const firstActivityId = await seedActivity()
    const secondActivityId = await seedActivity()
    await associateActivity(activityCodeId, firstActivityId)
    await associateActivity(activityCodeId, secondActivityId)

    await h.repos.appActivityMutations.enrollInActivityCode(userId, activityCodeId)
    const [first] = await readEnrollmentRows(activityCodeId, userId)
    assert.ok(first != null)
    const originalCreatedAt = first.created_at

    await h.db.execute(sql`select pg_sleep(0.01)`)
    await h.repos.appActivityMutations.enrollInActivityCode(userId, activityCodeId)

    const rows = await readEnrollmentRows(activityCodeId, userId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.created_at.getTime(), originalCreatedAt.getTime())
  })
})
