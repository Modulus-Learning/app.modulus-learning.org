import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'

import { activities, activityCodes, enrollment, progress, users } from '@/database/schema/index.js'
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

const seedEnrollment = async ({
  activityCodeId,
  fullName,
  activityId = uuidv7(),
}: {
  activityCodeId: string
  fullName: string | null
  activityId?: string
}): Promise<{ userId: string; activityId: string }> => {
  const userId = uuidv7()
  await h.db.insert(users).values({ id: userId, full_name: fullName })

  const existingActivity = await h.db.query.activities.findFirst({
    where: (table, { eq }) => eq(table.id, activityId),
  })
  if (existingActivity == null) {
    await h.db.insert(activities).values({
      id: activityId,
      url: `https://content.test/${activityId}`,
    })
  }

  await h.db.insert(enrollment).values({
    activity_code_id: activityCodeId,
    activity_id: activityId,
    user_id: userId,
  })
  return { userId, activityId }
}

describe('ActivityQueries all-scope progress reporting', () => {
  it('aggregates before enrollment joins and returns one row per enrollment', async () => {
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
    })
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
    assert.equal(rows.length, 2)
    assert.equal(new Set(rows.map((row) => `${row.user_id}:${row.activity_id}`)).size, 2)
    assert.ok(rows.every((row) => row.total === 2))

    const scopedRow = rows.find((row) => row.user_id === scoped.userId)
    assert.equal(scopedRow?.progress, 0.8)
    assert.equal(scopedRow?.created_at?.getTime(), early.getTime())
    assert.equal(scopedRow?.updated_at?.getTime(), late.getTime())

    const emptyRow = rows.find((row) => row.user_id === empty.userId)
    assert.equal(emptyRow?.progress, null)
    assert.equal(emptyRow?.created_at, null)
    assert.equal(emptyRow?.updated_at, null)
  })

  it('places null names, progress, and timestamps last in both directions', async () => {
    const activityCodeId = await seedActivityCode()
    const alpha = await seedEnrollment({ activityCodeId, fullName: 'Alpha' })
    const zulu = await seedEnrollment({ activityCodeId, fullName: 'Zulu' })
    await seedEnrollment({ activityCodeId, fullName: null })
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

  it('uses stable ascending enrollment keys across adjacent pages when aggregates tie', async () => {
    const activityCodeId = await seedActivityCode()
    const sharedActivityId = uuidv7()
    await h.db.insert(activities).values({
      id: sharedActivityId,
      url: `https://content.test/${sharedActivityId}`,
    })
    const enrollmentRows = await Promise.all(
      Array.from({ length: 5 }, () =>
        seedEnrollment({
          activityCodeId,
          fullName: 'Same Name',
          activityId: sharedActivityId,
        })
      )
    )
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
