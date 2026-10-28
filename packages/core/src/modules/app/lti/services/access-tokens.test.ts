/**
 * Characterisation of platform access-token exchange (OAuth 2 client
 * credentials with a JWT client assertion), used for score passback. Pinned
 * before the shared-LTI extraction.
 */
import assert from 'node:assert/strict'
import { afterEach, before, beforeEach, describe, it } from 'node:test'

import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'

import { LtiKeyStore } from '@/lib/lti-keystore.js'
import { AccessTokenManager } from '@/modules/app/lti/services/access-tokens.js'
import { createPlatformKeys, platformRecord, silentLogger } from '@/test-support/lti.js'
import type { Config } from '@/config.js'

const ISSUER = 'https://canvas.characterisation.test'

type Call = { url: string; init: RequestInit }

describe('AccessTokenManager', () => {
  let keystore: LtiKeyStore
  const realFetch = globalThis.fetch
  let calls: Call[]
  let respond: () => Promise<Response>

  before(async () => {
    const keys = await createPlatformKeys()
    keystore = await LtiKeyStore.create({
      config: {
        lti: { jwks: { kid: 'tool-key', privateKey: keys.privatePem, publicKey: keys.publicPem } },
      } as Config,
    })
  })

  beforeEach(() => {
    calls = []
    respond = async () =>
      Response.json({
        access_token: 'platform-token',
        expires_in: 3600,
        scope: 'scope-a scope-b',
        token_type: 'Bearer',
      })
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return await respond()
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const createManager = () =>
    new AccessTokenManager({
      logger: silentLogger(),
      config: { lti: { score_submission: { request_timeout_seconds: 5 } } } as Config,
      ltiKeyStore: keystore,
    })

  const platform = platformRecord(ISSUER)

  it('POSTs a form-encoded client-credentials request to the token endpoint', async () => {
    await createManager().getAccessToken(platform)
    assert.equal(calls.length, 1)
    const [call] = calls
    assert.equal(call?.url, platform.token_endpoint)
    assert.equal(call?.init.method, 'POST')
    assert.deepEqual(call?.init.headers, { 'Content-Type': 'application/x-www-form-urlencoded' })
    const body = call?.init.body as URLSearchParams
    assert.equal(body.get('grant_type'), 'client_credentials')
    assert.equal(
      body.get('client_assertion_type'),
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    )
    assert.equal(
      body.get('scope'),
      [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      ].join(' ')
    )
  })

  it('signs the client assertion with the tool key for the platform authorization server', async () => {
    await createManager().getAccessToken(platform)
    const body = calls[0]?.init.body as URLSearchParams | undefined
    const assertion = body?.get('client_assertion') ?? ''
    assert.deepEqual(decodeProtectedHeader(assertion), {
      typ: 'JWT',
      alg: 'RS256',
      kid: 'tool-key',
    })
    const { payload } = await jwtVerify(assertion, createLocalJWKSet(keystore.getJWKS()), {
      audience: platform.authorization_server,
    })
    assert.equal(payload.iss, platform.client_id)
    assert.equal(payload.sub, platform.client_id)
    assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 60)
    assert.equal(typeof payload.jti, 'string')
  })

  it('returns the token, its scopes and an expiry from expires_in', async () => {
    const before = Date.now()
    const result = await createManager().getAccessToken(platform)
    assert.equal(result.ok, true)
    assert.ok(result.ok)
    assert.equal(result.accessToken.token, 'platform-token')
    assert.deepEqual(result.accessToken.scopes, ['scope-a', 'scope-b'])
    const expiresIn = result.accessToken.expires.getTime() - before
    assert.ok(expiresIn >= 3_599_000 && expiresIn <= 3_601_000, String(expiresIn))
  })

  it('fetches a new token on every call: tokens are never cached (current gap)', async () => {
    const manager = createManager()
    await manager.getAccessToken(platform)
    await manager.getAccessToken(platform)
    assert.equal(calls.length, 2)
  })

  const failureFor = async (response: () => Promise<Response>) => {
    respond = response
    const result = await createManager().getAccessToken(platform)
    assert.equal(result.ok, false)
    return result.ok ? undefined : result
  }

  it('classifies failures by status', async () => {
    assert.equal(
      (await failureFor(async () => new Response('down', { status: 503 })))?.category,
      'transient'
    )
    assert.equal(
      (await failureFor(async () => new Response('slow down', { status: 429 })))?.category,
      'rate_limit'
    )
    for (const status of [400, 401, 403]) {
      const failure = await failureFor(async () => new Response('no', { status }))
      assert.equal(failure?.category, 'platform_config', String(status))
      assert.equal(failure?.status_code, status)
    }
  })

  it('classifies an unusable success body as unknown', async () => {
    assert.equal((await failureFor(async () => new Response('not json')))?.category, 'unknown')
    assert.equal(
      (await failureFor(async () => Response.json({ access_token: 'x', expires_in: '3600' })))
        ?.category,
      'unknown'
    )
  })

  it('classifies a network error as transient', async () => {
    const failure = await failureFor(async () => {
      throw new TypeError('fetch failed')
    })
    assert.equal(failure?.category, 'transient')
    assert.equal(failure?.status_code, undefined)
  })
})
