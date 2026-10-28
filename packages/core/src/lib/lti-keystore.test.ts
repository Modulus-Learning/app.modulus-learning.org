/**
 * Characterisation of the tool keystore: the JWKS Modulus publishes and the
 * tool messages it signs. Key IDs and keys must stay stable across the
 * shared-LTI extraction, because LMS registrations hold them.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'

import { LtiKeyStore } from '@/lib/lti-keystore.js'
import { createPlatformKeys, type PlatformKeys } from '@/test-support/lti.js'
import type { Config } from '@/config.js'

describe('LtiKeyStore', () => {
  let keys: PlatformKeys
  let store: LtiKeyStore

  before(async () => {
    keys = await createPlatformKeys()
    store = await LtiKeyStore.create({
      config: {
        lti: {
          jwks: { kid: 'tool-key-2026', privateKey: keys.privatePem, publicKey: keys.publicPem },
        },
      } as Config,
    })
  })

  it('publishes exactly one RS256 signing key under the configured key id', () => {
    const jwks = store.getJWKS()
    assert.equal(jwks.keys.length, 1)
    const [key] = jwks.keys
    assert.equal(key?.kid, 'tool-key-2026')
    assert.equal(key?.alg, 'RS256')
    assert.equal(key?.use, 'sig')
    assert.equal(key?.kty, 'RSA')
    assert.equal(key?.n, keys.jwk.n)
    assert.equal(key?.e, keys.jwk.e)
    assert.equal(store.getKeyID(), 'tool-key-2026')
  })

  it('publishes no private key material', () => {
    const [key] = store.getJWKS().keys
    for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      assert.equal((key as Record<string, unknown>)[field], undefined, field)
    }
  })

  it('signs messages verifiable against its own JWKS, with a one-minute default expiry', async () => {
    const token = await store.signPlatformMessage({ purpose: 'characterisation' })
    assert.deepEqual(decodeProtectedHeader(token), { alg: 'RS256', kid: 'tool-key-2026' })
    const { payload } = await jwtVerify(token, createLocalJWKSet(store.getJWKS()))
    assert.equal(payload.purpose, 'characterisation')
    assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 60)
  })

  it('honours an explicit expiry', async () => {
    const token = await store.signPlatformMessage({}, '10 minutes')
    const { payload } = await jwtVerify(token, createLocalJWKSet(store.getJWKS()))
    assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 600)
  })
})
