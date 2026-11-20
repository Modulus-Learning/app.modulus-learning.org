/**
 * LtiPlatformMutations.updatePlatform against PostgreSQL: it changes the
 * editable fields, leaves the issuer alone, and reports an unknown id.
 */
import assert from 'node:assert/strict'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { createCoreLogger } from '@/lib/logger.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import { LtiPlatformMutations, LtiPlatformQueries } from '../repository.js'

let h: TestHarness

beforeAll(async () => {
  h = await setupTestHarness()
})

afterAll(async () => {
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

const ISSUER = 'https://canvas.instructure.com'

const EDITED = {
  name: 'Canvas (edited)',
  client_id: '10000000000009',
  authorization_endpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://sso.canvaslms.com/login/oauth2/token',
  jwks_uri: 'https://sso.canvaslms.com/api/lti/security/jwks',
  authorization_server: 'sso.canvaslms.com',
}

const repos = () => {
  const deps = {
    logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
    utils: h.utils,
    db: h.dbManager,
  }
  return { queries: new LtiPlatformQueries(deps), mutations: new LtiPlatformMutations(deps) }
}

describe('LtiPlatformMutations.updatePlatform', () => {
  it('updates the editable fields and keeps the issuer', async () => {
    const { queries, mutations } = repos()
    const id = uuidv7()
    await mutations.createPlatform({
      id,
      name: 'Canvas',
      issuer: ISSUER,
      client_id: '10000000000001',
      authorization_endpoint: `${ISSUER}/api/lti/authorize_redirect`,
      token_endpoint: `${ISSUER}/login/oauth2/token`,
      jwks_uri: `${ISSUER}/api/lti/security/jwks`,
      authorization_server: `${ISSUER}/login/oauth2/token`,
    })

    const returned = await mutations.updatePlatform(id, EDITED)

    assert.deepEqual(returned, { id, issuer: ISSUER, ...EDITED })
    assert.deepEqual(await queries.findPlatformById(id), { id, issuer: ISSUER, ...EDITED })
  })

  it('throws ERR_NOT_FOUND for an unknown id', async () => {
    const { mutations } = repos()
    await assert.rejects(
      mutations.updatePlatform(uuidv7(), EDITED),
      (error: { code?: string }) => error.code === 'ERR_NOT_FOUND'
    )
  })
})
