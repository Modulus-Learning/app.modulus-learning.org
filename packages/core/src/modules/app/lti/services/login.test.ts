/**
 * Characterisation of OIDC login initiation (the first step of an LTI launch),
 * pinned before the shared-LTI extraction.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ErrorCodes } from '@/modules/app/lti/errors.js'
import { LtiLoginService } from '@/modules/app/lti/services/login.js'
import { platformRecord, silentLogger } from '@/test-support/lti.js'
import type { Config } from '@/config.js'
import type { LtiMutations, LtiQueries } from '@/modules/app/lti/repository/index.js'

const ISSUER = 'https://canvas.characterisation.test'
const REDIRECT_URI = 'https://modulus.characterisation.test/routes/lti/launch'

const createService = (platformFound = true) => {
  const platform = platformRecord(ISSUER)
  const nonces: string[] = []
  const service = new LtiLoginService({
    logger: silentLogger(),
    config: { lti: { redirect_uri: REDIRECT_URI } } as Config,
    queries: {
      findPlatformByIssuer: async () => (platformFound ? platform : undefined),
    } as unknown as LtiQueries,
    mutations: {
      insertNonce: async (nonce: string) => {
        nonces.push(nonce)
      },
    } as unknown as LtiMutations,
  })
  return { service, platform, nonces }
}

const request = {
  iss: ISSUER,
  login_hint: 'login-hint-1',
  target_link_uri: REDIRECT_URI,
  lti_message_hint: 'message-hint-1',
}

describe('LtiLoginService.handleLogin', () => {
  it('redirects to the platform authorization endpoint with the OIDC request', async () => {
    const { service, platform, nonces } = createService()
    const response = await service.handleLogin(request)
    const url = new URL(response.redirectUrl)

    assert.equal(`${url.origin}${url.pathname}`, platform.authorization_endpoint)
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid',
      prompt: 'none',
      client_id: platform.client_id,
      redirect_uri: REDIRECT_URI,
      login_hint: 'login-hint-1',
      nonce: nonces[0],
      state: response.stateId,
      lti_message_hint: 'message-hint-1',
    })
  })

  it('stores one fresh nonce and returns the issuer as the state cookie value', async () => {
    const { service, nonces } = createService()
    const first = await service.handleLogin(request)
    const second = await service.handleLogin(request)

    assert.equal(nonces.length, 2)
    assert.notEqual(nonces[0], nonces[1])
    assert.match(nonces[0] ?? '', /^[A-Za-z0-9_-]{40}$/)
    assert.notEqual(first.stateId, second.stateId)
    assert.match(first.stateId, /^[A-Za-z0-9_-]{40}$/)
    assert.equal(first.stateValue, ISSUER)
  })

  it('accepts a request without client_id, and one naming the registered client', async () => {
    const { service, platform } = createService()
    await service.handleLogin(request)
    await service.handleLogin({ ...request, client_id: platform.client_id })
  })

  it('rejects a client_id that is not the registered client, storing no nonce', async () => {
    const { service, nonces } = createService()
    await assert.rejects(
      service.handleLogin({ ...request, client_id: 'someone-else' }),
      (error) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.INVALID_LOGIN)
        return true
      }
    )
    assert.deepEqual(nonces, [])
  })

  it('rejects an unregistered issuer', async () => {
    const { service } = createService(false)
    await assert.rejects(service.handleLogin(request), (error) => {
      assert.equal((error as { code?: string }).code, ErrorCodes.INVALID_LOGIN)
      return true
    })
  })

  it('sends lti_message_hint=undefined when the platform sent none (current gap)', async () => {
    const { service } = createService()
    const { lti_message_hint: _omitted, ...withoutHint } = request
    const response = await service.handleLogin(withoutHint)
    assert.equal(new URL(response.redirectUrl).searchParams.get('lti_message_hint'), 'undefined')
  })
})
