/**
 * Email linking under concurrency, against the real database: two launches that
 * both find the same unlinked account by email must not both link it.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { users } from '@/database/schema/index.js'
import { createCoreLogger } from '@/lib/logger.js'
import { SessionMutations, SessionQueries } from '@/modules/app/session/repository/index.js'
import { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
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

const ISSUER = 'https://canvas.test'
const EMAIL = 'learner@example.test'

/**
 * A sign-in service whose email lookups wait until `parties` launches have all
 * read the account, so every launch sees it unlinked before any of them writes.
 */
const racingService = (parties: number) => {
  const deps = {
    logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
    utils: h.utils,
    db: h.dbManager,
  }
  const queries = new SessionQueries(deps)
  let arrived = 0
  let release: () => void = () => {}
  const allRead = new Promise<void>((resolve) => {
    release = resolve
  })
  const findUserByEmail = queries.findUserByEmail.bind(queries)
  queries.findUserByEmail = async (email: string) => {
    const user = await findUserByEmail(email)
    arrived += 1
    if (arrived === parties) release()
    await allRead
    return user
  }
  return new LtiSignInService({
    logger: deps.logger,
    queries,
    mutations: new SessionMutations(deps),
  })
}

/**
 * A sign-in service whose first identity lookup waits, after reading, until the
 * returned `release` is called, so another launch can link the account between
 * that launch's identity lookup and its email lookup.
 */
const pausedAfterIdentityLookup = () => {
  const deps = {
    logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
    utils: h.utils,
    db: h.dbManager,
  }
  const queries = new SessionQueries(deps)
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let paused = false
  let reached: () => void = () => {}
  const reachedPause = new Promise<void>((resolve) => {
    reached = resolve
  })
  const findUserByLtiId = queries.findUserByLtiId.bind(queries)
  queries.findUserByLtiId = async (iss: string, sub: string) => {
    const user = await findUserByLtiId(iss, sub)
    if (!paused) {
      paused = true
      reached()
      await released
    }
    return user
  }
  const service = new LtiSignInService({
    logger: deps.logger,
    queries,
    mutations: new SessionMutations(deps),
  })
  return { service, reachedPause, release }
}

const launch = (sub: string) => ({ iss: ISSUER, sub, name: 'Launch User', email: EMAIL })

const seedUnlinkedAccount = async () => {
  const id = uuidv7()
  await h.db
    .insert(users)
    .values({ id, full_name: 'Existing User', email: EMAIL, is_enabled: true })
  return id
}

describe('LtiSignInService email linking (database)', () => {
  it('links the account to exactly one of two concurrent, different identities', async () => {
    const userId = await seedUnlinkedAccount()
    const service = racingService(2)

    const results = await Promise.allSettled([
      service.signInLti(launch('subject-a'), false),
      service.signInLti(launch('subject-b'), false),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.equal(fulfilled.length, 1)
    assert.equal(rejected.length, 1)
    assert.equal((rejected[0] as PromiseRejectedResult).reason?.code, 'ERR_LTI_IDENTITY_CONFLICT')

    const winner = results.findIndex((result) => result.status === 'fulfilled')
    const [row] = await h.db.select().from(users).where(eq(users.id, userId))
    assert.equal(row?.lti_iss, ISSUER)
    assert.equal(row?.lti_sub, winner === 0 ? 'subject-a' : 'subject-b')
  })

  it('signs in both of two concurrent launches carrying the same identity', async () => {
    const userId = await seedUnlinkedAccount()
    const service = racingService(2)

    const results = await Promise.allSettled([
      service.signInLti(launch('subject-a'), false),
      service.signInLti(launch('subject-a'), false),
    ])

    assert.deepEqual(
      results.map((result) => result.status),
      ['fulfilled', 'fulfilled']
    )
    const [row] = await h.db.select().from(users).where(eq(users.id, userId))
    assert.equal(row?.lti_sub, 'subject-a')
  })

  it('signs in a launch whose email lookup finds the account just linked to its own identity', async () => {
    const userId = await seedUnlinkedAccount()
    const { service, reachedPause, release } = pausedAfterIdentityLookup()

    // Launch A finds no account by identity, then pauses before its email lookup.
    const first = service.signInLti(launch('subject-a'), false)
    await reachedPause

    // Launch B, same identity, links the account while A is paused.
    await service.signInLti(launch('subject-a'), false)

    release()
    const result = await first

    assert.equal(result.user.id, userId)
    const [row] = await h.db.select().from(users).where(eq(users.id, userId))
    assert.equal(row?.lti_iss, ISSUER)
    assert.equal(row?.lti_sub, 'subject-a')
  })
})
