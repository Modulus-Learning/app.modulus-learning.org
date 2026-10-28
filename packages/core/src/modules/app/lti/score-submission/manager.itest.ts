/**
 * The score-submission manager's reconcile loop against the real database: a
 * registration whose values change is served by a new score client, after the
 * old processor drains and the cached token is dropped, without a restart.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import type { LtiRegistration } from '@modulus-learning/lti'
import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { configSchema } from '@/config.js'
import { platforms } from '@/database/schema/index.js'
import { createCoreLogger } from '@/lib/logger.js'
import { LtiScoreSubmissionManager } from '@/modules/app/lti/score-submission/manager.js'
import { syntheticAdapter } from '@/test-support/lms.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { Config } from '@/config.js'
import type { AccessTokenManager } from '@/modules/app/lti/services/access-tokens.js'

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

const config = {
  lti: {
    score_submission: configSchema.shape.lti.shape.score_submission.parse({
      platform_reconcile_interval_seconds: 0.05,
      idle_interval_ms: 20,
    }),
  },
} as unknown as Config

const waitFor = async (condition: () => boolean, what: string) => {
  const deadline = Date.now() + 5_000
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const createManager = () => {
  const clients: LtiRegistration[] = []
  const forgotten: string[] = []
  const lms = syntheticAdapter({
    createScoreClient: ({ registration }) => {
      clients.push(registration)
      return {
        client: {
          issuer: registration.issuer,
          publishScore: async () => ({ result: { ok: true } }),
        },
        scheduling: { target: () => 1, record: () => undefined, reset: () => undefined },
      }
    },
  })
  const manager = new LtiScoreSubmissionManager({
    logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
    config,
    tx: h.tx,
    scoreSubmissionQueries: h.repos.scoreQueries,
    scoreSubmissionMutations: h.repos.scoreMutations,
    accessTokenManager: {
      forgetRegistration: (id: string) => forgotten.push(id),
    } as unknown as AccessTokenManager,
    lmsAdapter: lms,
  })
  return { manager, clients, forgotten }
}

describe('LtiScoreSubmissionManager reconcile (database)', () => {
  it('replaces the score client when a registration changes, without a restart', async () => {
    const id = uuidv7()
    await h.db.insert(platforms).values({
      id,
      issuer: ISSUER,
      name: 'Canvas',
      client_id: 'client-1',
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      authorization_server: ISSUER,
    })
    const { manager, clients, forgotten } = createManager()
    manager.start()
    try {
      await waitFor(() => clients.length === 1, 'the first score client')
      // Unchanged registrations keep their processor across reconciles.
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal(clients.length, 1)

      await h.db
        .update(platforms)
        .set({ client_id: 'client-2', token_endpoint: `${ISSUER}/corrected/token` })
        .where(eq(platforms.id, id))

      await waitFor(() => clients.length === 2, 'a replacement score client')
      assert.equal(clients[1]?.client_id, 'client-2')
      assert.equal(clients[1]?.token_endpoint, `${ISSUER}/corrected/token`)
      assert.deepEqual(forgotten, [id])
    } finally {
      await manager.stop()
    }
  })

  it('drops the cached token when a registration is removed', async () => {
    const id = uuidv7()
    await h.db.insert(platforms).values({
      id,
      issuer: ISSUER,
      name: 'Canvas',
      client_id: 'client-1',
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      authorization_server: ISSUER,
    })
    const { manager, clients, forgotten } = createManager()
    manager.start()
    try {
      await waitFor(() => clients.length === 1, 'the first score client')
      await h.db.delete(platforms).where(eq(platforms.id, id))
      await waitFor(() => forgotten.length === 1, 'the removed registration to be forgotten')
      assert.deepEqual(forgotten, [id])
    } finally {
      await manager.stop()
    }
  })
})
