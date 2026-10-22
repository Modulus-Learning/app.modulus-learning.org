import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { pino } from 'pino'

import { createCoreLogger } from '@/lib/logger.js'
import { GithubSignInService } from './github-oauth.js'
import { GoogleSignInService } from './google-oauth.js'
import type { Config } from '@/config.js'
import type { SessionMutations, SessionQueries } from '../repository/index.js'
import type { TokenIssuer } from './token-issuer.js'

// An instance started without OAuth configuration (core `oauth` is optional,
// e.g. DEPLOYMENT_MODE=admin) must refuse OAuth sign-in with a configuration
// error before any network request or database read.
describe('oauth sign-in without oauth configuration', () => {
  const realFetch = globalThis.fetch
  let fetchCalls = 0

  beforeEach(() => {
    fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls++
      throw new Error('fetch must not be called')
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const unreachable = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('dependency must not be used')
      },
    }
  )

  const deps = {
    logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
    config: { oauth: undefined } as unknown as Config,
    tokenIssuer: unreachable as TokenIssuer,
    queries: unreachable as SessionQueries,
    mutations: unreachable as SessionMutations,
  }

  it('github sign-in fails with a configuration error and no fetch', async () => {
    const service = new GithubSignInService(deps)
    await assert.rejects(
      service.signInGithub({
        tokens: { access_token: 'token', scope: 'user:email', token_type: 'bearer' },
        remember_me: false,
      }),
      /github oauth is not configured/
    )
    assert.equal(fetchCalls, 0)
  })

  it('google sign-in fails with a configuration error', async () => {
    const service = new GoogleSignInService(deps)
    await assert.rejects(
      service.signInGoogle({ tokens: { access_token: 'token' }, remember_me: false }),
      /google oauth is not configured/
    )
    assert.equal(fetchCalls, 0)
  })
})
