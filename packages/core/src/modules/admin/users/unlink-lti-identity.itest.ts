/**
 * Admin LTI unlink against the real database: the conditional update, the
 * data it must leave alone, and the sign-in behaviour it reopens.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID, lineitems, progress, users } from '@/database/schema/index.js'
import { AdminAuth } from '@/lib/auth.js'
import { CoreError } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { SessionMutations, SessionQueries } from '@/modules/app/session/repository/index.js'
import { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import { seedScenario } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import { UserMutations, type UserQueries } from './repository/index.js'
import { UserService } from './services/users.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'

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

const EMAIL = 'learner@example.test'
const OLD_SUB = 'subject-old'
const NEW_SUB = 'subject-new'

const silent = () => createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const userService = () => {
  const logger = silent()
  return new UserService({
    logger,
    tx: {} as TXManager,
    mailer: {} as Mailer,
    queries: {} as UserQueries,
    mutations: new UserMutations({ logger, utils: h.utils, db: h.dbManager }),
  })
}

const signIn = () => {
  const deps = { logger: silent(), utils: h.utils, db: h.dbManager }
  return new LtiSignInService({
    logger: deps.logger,
    queries: new SessionQueries(deps),
    mutations: new SessionMutations(deps),
  })
}

const admin = () => new AdminAuth(uuidv7(), ['users:edit'])

/** A linked learner with progress and a line item, as a refused learner would have. */
const seedLinkedLearner = async () => {
  const scenario = await seedScenario(h.db)
  await h.db
    .update(users)
    .set({
      email: EMAIL,
      full_name: 'Linked Learner',
      is_enabled: true,
      lti_iss: scenario.issuer,
      lti_sub: OLD_SUB,
    })
    .where(eq(users.id, scenario.userId))
  await h.db.insert(progress).values({
    user_id: scenario.userId,
    activity_id: scenario.activityId,
    scope_id: DEFAULT_SCOPE_ID,
    progress: 0.5,
  })
  await h.db.insert(lineitems).values({
    id: uuidv7(),
    user_id: scenario.userId,
    activity_id: scenario.activityId,
    scope_id: DEFAULT_SCOPE_ID,
    platform_issuer: scenario.issuer,
    deployment_id: scenario.deploymentId,
    lineitem_url: 'https://canvas.test/api/lti/courses/1/line_items/1',
    lti_user_id: OLD_SUB,
    submittable_progress: 0.5,
  })
  const [row] = await h.db.select().from(users).where(eq(users.id, scenario.userId))
  assert.ok(row)
  return { scenario, row }
}

const launch = (iss: string, sub: string) => ({ iss, sub, name: 'Launch User', email: EMAIL })

describe('admin LTI unlink (database)', () => {
  it('clears the identity, bumps vid, and leaves progress and line items alone', async () => {
    const { scenario, row } = await seedLinkedLearner()

    const result = await userService().unlinkLtiIdentity(admin(), {
      id: row.id,
      vid: row.vid,
      lti_iss: scenario.issuer,
      lti_sub: OLD_SUB,
    })

    assert.deepEqual(result, { changed: true, vid: row.vid + 1 })
    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_iss, null)
    assert.equal(after?.lti_sub, null)
    assert.equal(after?.email, EMAIL)
    assert.equal((await h.db.select().from(progress).where(eq(progress.user_id, row.id))).length, 1)
    assert.equal(
      (await h.db.select().from(lineitems).where(eq(lineitems.user_id, row.id))).length,
      1
    )
  })

  it('refuses a stale vid and writes nothing', async () => {
    const { scenario, row } = await seedLinkedLearner()

    await assert.rejects(
      userService().unlinkLtiIdentity(admin(), {
        id: row.id,
        vid: row.vid - 1,
        lti_iss: scenario.issuer,
        lti_sub: OLD_SUB,
      }),
      (error: unknown) => error instanceof CoreError && error.code === 'ERR_VERSION_CONFLICT'
    )
    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_sub, OLD_SUB)
    assert.equal(after?.vid, row.vid)
  })

  it('refuses when the identity changed after the page was loaded', async () => {
    const { scenario, row } = await seedLinkedLearner()
    // A launch relinks between the admin's view and the unlink; vid is not
    // bumped by sign-in linking, so only the identity guard catches this.
    await h.db.update(users).set({ lti_sub: NEW_SUB }).where(eq(users.id, row.id))

    await assert.rejects(
      userService().unlinkLtiIdentity(admin(), {
        id: row.id,
        vid: row.vid,
        lti_iss: scenario.issuer,
        lti_sub: OLD_SUB,
      }),
      (error: unknown) => error instanceof CoreError && error.code === 'ERR_VERSION_CONFLICT'
    )
    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_sub, NEW_SUB)
  })

  it('clears a partial identity, matching the null column', async () => {
    const { scenario, row } = await seedLinkedLearner()
    await h.db.update(users).set({ lti_sub: null }).where(eq(users.id, row.id))

    const result = await userService().unlinkLtiIdentity(admin(), {
      id: row.id,
      vid: row.vid,
      lti_iss: scenario.issuer,
      lti_sub: null,
    })

    assert.equal(result.changed, true)
    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_iss, null)
  })

  it('lets the new identity link the same account by email on its next launch', async () => {
    const { scenario, row } = await seedLinkedLearner()
    const service = signIn()

    // Before unlinking, the new identity is refused.
    await assert.rejects(service.signInLti(launch(scenario.issuer, NEW_SUB), false), {
      code: 'ERR_LTI_IDENTITY_CONFLICT',
    })

    await userService().unlinkLtiIdentity(admin(), {
      id: row.id,
      vid: row.vid,
      lti_iss: scenario.issuer,
      lti_sub: OLD_SUB,
    })
    await service.signInLti(launch(scenario.issuer, NEW_SUB), false)

    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_sub, NEW_SUB)
  })

  it('lets the previous identity relink if it launches first (documented behaviour)', async () => {
    const { scenario, row } = await seedLinkedLearner()

    await userService().unlinkLtiIdentity(admin(), {
      id: row.id,
      vid: row.vid,
      lti_iss: scenario.issuer,
      lti_sub: OLD_SUB,
    })
    await signIn().signInLti(launch(scenario.issuer, OLD_SUB), false)

    const [after] = await h.db.select().from(users).where(eq(users.id, row.id))
    assert.equal(after?.lti_sub, OLD_SUB)
  })
})
