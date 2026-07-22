import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'

import { createCoreLogger } from '@/lib/logger.js'
import { type FetchFn, HttpLtiAgsClient } from './ags-client.js'
import type { Config } from '@/config.js'
import type { AccessToken, AccessTokenResult } from '../types/access-token.js'
import type { PlatformRecord } from './repository.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const config = {
  lti: { score_submission: { request_timeout_seconds: 30 } },
} as unknown as Config

const platform: PlatformRecord = {
  id: 'platform-1',
  issuer: 'https://canvas.test',
  name: 'Test',
  client_id: 'client-1',
  authorization_endpoint: 'https://canvas.test/auth',
  token_endpoint: 'https://canvas.test/token',
  jwks_uri: 'https://canvas.test/jwks',
  authorization_server: 'https://canvas.test',
}

const okToken: AccessTokenResult = {
  ok: true,
  accessToken: { token: 'tok-1', expires: new Date(Date.now() + 3_600_000), scopes: ['score'] },
}

type FetchCall = { url: string; init: RequestInit | undefined }

function makeClient(opts: { fetch?: FetchFn; tokenResult?: AccessTokenResult }): {
  client: HttpLtiAgsClient
  calls: FetchCall[]
  invalidated: string[]
} {
  const calls: FetchCall[] = []
  const invalidated: string[] = []

  const fetchFn: FetchFn =
    opts.fetch ??
    (async (input, init) => {
      calls.push({ url: String(input), init })
      return new Response('', { status: 200 })
    })

  const accessTokenManager = {
    getAccessToken: (): Promise<AccessTokenResult> => Promise.resolve(opts.tokenResult ?? okToken),
    invalidateAccessToken: (_platform: PlatformRecord, token: AccessToken): void => {
      invalidated.push(token.token)
    },
  }

  const client = new HttpLtiAgsClient({ logger, config, platform, accessTokenManager, fetchFn })
  return { client, calls, invalidated }
}

// Build a recording fetch that answers with a scripted response.
function respondWith(
  calls: FetchCall[],
  status: number,
  body = '',
  headers?: Record<string, string>
): FetchFn {
  return async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(body, { status, headers })
  }
}

describe('HttpLtiAgsClient.publishScore', () => {
  it('POSTs the AGS Score payload to <lineitemUrl>/scores', async () => {
    const { client, calls } = makeClient({})

    const outcome = await client.publishScore({
      lineitemUrl: 'https://canvas.test/lineitems/9',
      ltiUserId: 'lti-user-7',
      scoreGiven: 0.5,
    })

    assert.equal(outcome.result.ok, true)
    assert.equal(calls.length, 1)
    const call = calls[0]
    assert.ok(call)
    assert.equal(call.url, 'https://canvas.test/lineitems/9/scores')
    assert.equal(call.init?.method, 'POST')

    const body = call.init?.body as URLSearchParams
    assert.equal(body.get('userId'), 'lti-user-7')
    assert.equal(body.get('scoreGiven'), '0.5')
    assert.equal(body.get('scoreMaximum'), '1')
    assert.equal(body.get('gradingProgress'), 'FullyGraded')
    assert.equal(body.get('activityProgress'), 'Submitted', 'partial progress => Submitted')
  })

  it('reports Completed once progress reaches 1', async () => {
    const { client, calls } = makeClient({})
    await client.publishScore({ lineitemUrl: 'https://x/li', ltiUserId: 'u', scoreGiven: 1 })
    const body = calls[0]?.init?.body as URLSearchParams
    assert.equal(body.get('activityProgress'), 'Completed')
  })

  it('parses the rate-limit headers into a reading', async () => {
    const calls: FetchCall[] = []
    const { client } = makeClient({
      fetch: respondWith(calls, 200, '', {
        'X-Rate-Limit-Remaining': '120',
        'X-Request-Cost': '3.5',
      }),
    })

    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.2,
    })
    assert.deepEqual(
      { remaining: outcome.reading?.remaining, cost: outcome.reading?.cost },
      { remaining: 120, cost: 3.5 }
    )
  })

  it('omits the reading when the rate-limit header is absent', async () => {
    const calls: FetchCall[] = []
    const { client } = makeClient({ fetch: respondWith(calls, 200) })
    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.2,
    })
    assert.equal(outcome.reading, undefined)
  })

  it('classifies a 401 as platform_token and invalidates the access token', async () => {
    const calls: FetchCall[] = []
    const { client, invalidated } = makeClient({
      fetch: respondWith(calls, 401, 'Invalid access token'),
    })

    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok, false)
    assert.equal(outcome.result.ok === false && outcome.result.category, 'platform_token')
    assert.deepEqual(invalidated, ['tok-1'], 'the rejected token was invalidated')
  })

  it('classifies a 403 as rate_limit without invalidating the token', async () => {
    const calls: FetchCall[] = []
    const { client, invalidated } = makeClient({ fetch: respondWith(calls, 403, 'blocked') })
    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok === false && outcome.result.category, 'rate_limit')
    assert.deepEqual(invalidated, [])
  })

  it('classifies a 5xx as transient', async () => {
    const calls: FetchCall[] = []
    const { client } = makeClient({ fetch: respondWith(calls, 503, 'unavailable') })
    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok === false && outcome.result.category, 'transient')
  })

  it('classifies a 404 as lineitem_dead', async () => {
    const calls: FetchCall[] = []
    const { client } = makeClient({
      fetch: respondWith(calls, 404, 'The specified resource does not exist'),
    })
    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok === false && outcome.result.category, 'lineitem_dead')
  })

  it('short-circuits to a failure (no fetch) when the access token cannot be obtained', async () => {
    const calls: FetchCall[] = []
    const { client } = makeClient({
      fetch: respondWith(calls, 200),
      tokenResult: {
        ok: false,
        category: 'platform_config',
        message: 'key not registered',
        status_code: 401,
      },
    })

    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok, false)
    assert.equal(outcome.result.ok === false && outcome.result.category, 'platform_config')
    assert.equal(calls.length, 0, 'no request is made without a token')
  })

  it('maps a network error to a transient failure', async () => {
    const { client } = makeClient({
      fetch: async () => {
        throw new Error('connection reset')
      },
    })
    const outcome = await client.publishScore({
      lineitemUrl: 'https://x/li',
      ltiUserId: 'u',
      scoreGiven: 0.5,
    })
    assert.equal(outcome.result.ok === false && outcome.result.category, 'transient')
  })
})
