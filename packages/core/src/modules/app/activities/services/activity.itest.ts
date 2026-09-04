import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodeMember,
  activityCodes,
  users,
} from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { ErrorCodes } from '@/modules/activity-registration/errors.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { CoreError } from '@/lib/errors.js'

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

const ORIGIN = 'https://content.test'

const seedInstructor = async (): Promise<UserAuth> => {
  const id = uuidv7()
  await h.db.insert(users).values({ id, full_name: 'Test Instructor' })
  return new UserAuth(id, [])
}

const seedRule = async (origin = ORIGIN): Promise<void> => {
  await h.repos.allowlistMutations.createRule({ id: uuidv7(), origin, path_prefix: '/' })
}

const countAll = async (): Promise<{
  codes: number
  members: number
  activities: number
  associations: number
}> => ({
  codes: (await h.db.select().from(activityCodes)).length,
  members: (await h.db.select().from(activityCodeMember)).length,
  activities: (await h.db.select().from(activities)).length,
  associations: (await h.db.select().from(activityActivityCode)).length,
})

describe('ActivityService.createActivityCode over PostgreSQL', () => {
  it('writes nothing at all when any submitted url is denied', async () => {
    // Atomicity over a real transaction, which a fake cannot demonstrate. The
    // denial is raised after the code row and its first member have already
    // been written, so this proves the rollback -- not the statement order.
    const userAuth = await seedInstructor()
    await seedRule()

    await assert.rejects(
      h.services.appActivity.createActivityCode(userAuth, {
        code: 'brave-otter',
        urls: [`${ORIGIN}/allowed`, 'https://elsewhere.test/denied'],
      }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
        return true
      }
    )

    assert.deepEqual(await countAll(), {
      codes: 0,
      members: 0,
      activities: 0,
      associations: 0,
    })
  })

  it('commits the code, its member, the activities and the associations when every url is allowed', async () => {
    const userAuth = await seedInstructor()
    await seedRule()

    await h.services.appActivity.createActivityCode(userAuth, {
      code: 'brave-otter',
      urls: [`${ORIGIN}/one`, `${ORIGIN}/two`],
    })

    assert.deepEqual(await countAll(), {
      codes: 1,
      members: 1,
      activities: 2,
      associations: 2,
    })
  })

  it('admits a grandfathered url under an empty policy', async () => {
    // No rule exists at all, and the activity predates the policy.
    const userAuth = await seedInstructor()
    const url = `${ORIGIN}/legacy`
    await h.db.insert(activities).values({ id: uuidv7(), url })

    await h.services.appActivity.createActivityCode(userAuth, {
      code: 'brave-otter',
      urls: [url],
    })

    const counts = await countAll()
    assert.equal(counts.codes, 1)
    assert.equal(counts.associations, 1)
    // No second row was created for the same URL.
    assert.equal(counts.activities, 1)
  })
})

describe('ActivityService.updateActivityCode over PostgreSQL', () => {
  it('leaves the code and its associations untouched when a new url is denied', async () => {
    const userAuth = await seedInstructor()
    await seedRule()

    const created = await h.services.appActivity.createActivityCode(userAuth, {
      code: 'brave-otter',
      description: 'the original description',
      urls: [`${ORIGIN}/one`],
    })

    await assert.rejects(
      h.services.appActivity.updateActivityCode(userAuth, {
        id: created.id,
        description: 'an edited description',
        urls: [`${ORIGIN}/one`, 'https://elsewhere.test/denied'],
      }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
        return true
      }
    )

    // The description edit rolled back with the rest, and the existing
    // association survived the remove-and-recreate.
    const [code] = await h.db.select().from(activityCodes)
    assert.equal(code?.description, 'the original description')
    const counts = await countAll()
    assert.equal(counts.activities, 1)
    assert.equal(counts.associations, 1)
  })

  it('saves a description edit on a code whose url no longer matches any rule', async () => {
    // The regression the resolve-first ordering exists to prevent, over the
    // real database: the instructor edits a description on a code containing a
    // grandfathered URL, with nothing in the policy matching it.
    const userAuth = await seedInstructor()
    await seedRule()

    const created = await h.services.appActivity.createActivityCode(userAuth, {
      code: 'brave-otter',
      description: 'the original description',
      urls: [`${ORIGIN}/one`],
    })

    // The administrator withdraws the rule that admitted it.
    const rules = await h.repos.allowlistQueries.listRules()
    for (const rule of rules) {
      await h.repos.allowlistMutations.deleteRule(rule.id)
    }
    assert.deepEqual(await h.repos.allowlistQueries.listEnabledRules(), [])

    await h.services.appActivity.updateActivityCode(userAuth, {
      id: created.id,
      description: 'an edited description',
      urls: [`${ORIGIN}/one`],
    })

    const [code] = await h.db.select().from(activityCodes)
    assert.equal(code?.description, 'an edited description')
    const counts = await countAll()
    assert.equal(counts.associations, 1)
  })
})
