import { importPKCS8, SignJWT } from 'jose'
import { beforeAll, describe, expect, inject, test } from 'vitest'

import {
  cookieAttributes,
  cookieValue,
  PLATFORM,
  rawSetCookies,
  request,
  setCookieNamed,
} from './harness'

// A successful LTI 1.3 launch, end to end over HTTP (review: checkpoints 2 and
// 4): OIDC login initiation sets the launch-scoped state cookie; the launch,
// with an id_token signed by the mock platform for the issued nonce, clears
// that cookie and issues the learner session pair. Each raw Set-Cookie header
// and its attributes are asserted.

const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim'

const form = (fields: Record<string, string>) => new URLSearchParams(fields)

const login = async () => {
  const response = await request('/routes/lti/login', {
    method: 'POST',
    body: form({
      iss: PLATFORM.issuer,
      login_hint: 'session-login-hint',
      target_link_uri: 'https://modulus.test/routes/lti/launch',
      client_id: PLATFORM.clientId,
    }),
  })
  const location = new URL(response.headers.get('location') as string)
  const state = location.searchParams.get('state') as string
  const nonce = location.searchParams.get('nonce') as string
  return { response, location, state, nonce }
}

const idToken = async (nonce: string) =>
  new SignJWT({
    sub: 'session-lti-user',
    nonce,
    [`${CLAIM}/version`]: '1.3.0',
    [`${CLAIM}/deployment_id`]: PLATFORM.deploymentId,
    [`${CLAIM}/target_link_uri`]: 'https://modulus.test/routes/lti/launch',
    [`${CLAIM}/roles`]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    [`${CLAIM}/message_type`]: 'LtiResourceLinkRequest',
    [`${CLAIM}/resource_link`]: { id: 'session-resource-link' },
    [`${CLAIM}/custom`]: { modulus_launch_type: 'view-dashboard' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: PLATFORM.kid })
    .setIssuer(PLATFORM.issuer)
    .setAudience(PLATFORM.clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(await importPKCS8(inject('platformPrivateKey'), 'RS256'))

const launch = (state: string, token: string, cookie: string) =>
  request('/routes/lti/launch', {
    method: 'POST',
    headers: { cookie },
    body: form({ id_token: token, state }),
  })

describe('LTI login initiation', () => {
  test('303 to the platform with state and nonce, and the state cookie', async () => {
    const { response, location, state, nonce } = await login()
    expect(response.status).toBe(303)
    expect(location.pathname).toBe('/auth')
    expect(location.searchParams.get('client_id')).toBe(PLATFORM.clientId)
    expect(state.length).toBeGreaterThan(20)
    expect(nonce.length).toBeGreaterThan(20)

    const header = setCookieNamed(response, `state-${state}`) as string
    expect(header).toBeDefined()
    expect(cookieValue(header)).toBe(encodeURIComponent(PLATFORM.issuer))
    const attributes = cookieAttributes(header)
    expect(attributes).toEqual(
      expect.arrayContaining([
        'path=/routes/lti/launch',
        'max-age=120',
        'httponly',
        'secure',
        'samesite=none',
      ])
    )
  })
})

describe('LTI launch', () => {
  let launched: { response: Response; state: string; nonce: string; stateCookie: string }

  beforeAll(async () => {
    const { response: loginResponse, state, nonce } = await login()
    const stateHeader = setCookieNamed(loginResponse, `state-${state}`) as string
    const stateCookie = `state-${state}=${cookieValue(stateHeader)}`
    const response = await launch(state, await idToken(nonce), stateCookie)
    launched = { response, state, nonce, stateCookie }
  })

  test('303 to the dashboard', () => {
    expect(launched.response.status).toBe(303)
    expect(launched.response.headers.get('location')).toBe('/dashboard')
  })

  test('clears the state cookie on its launch path', () => {
    const header = setCookieNamed(launched.response, `state-${launched.state}`) as string
    expect(header).toBeDefined()
    const attributes = cookieAttributes(header)
    expect(attributes).toEqual(
      expect.arrayContaining(['path=/routes/lti/launch', 'secure', 'samesite=none'])
    )
    expect(
      attributes.some((a) => a === 'max-age=0' || a.startsWith('expires=thu, 01 jan 1970'))
    ).toBe(true)
  })

  test.each(['user_session', 'user_refresh'])('issues %s for the iframe', (name) => {
    const header = setCookieNamed(launched.response, name) as string
    expect(header).toBeDefined()
    expect(cookieAttributes(header)).toEqual(
      expect.arrayContaining(['path=/', 'httponly', 'secure', 'samesite=none'])
    )
    expect(cookieValue(header).length).toBeGreaterThan(20)
  })

  test('issues no other cookies', () => {
    const names = rawSetCookies(launched.response).map((h) => h.slice(0, h.indexOf('=')))
    expect(names.sort()).toEqual([`state-${launched.state}`, 'user_refresh', 'user_session'].sort())
  })

  test('the issued session verifies', async () => {
    const session = cookieValue(setCookieNamed(launched.response, 'user_session') as string)
    const verified = await request('/routes/auth/session', {
      headers: { cookie: `user_session=${session}` },
    })
    expect(verified.status).toBe(200)
    expect((await verified.json())?.user?.id).toEqual(expect.any(String))
  })

  test('replaying the launch (nonce already claimed) is refused', async () => {
    const replay = await launch(launched.state, await idToken(launched.nonce), launched.stateCookie)
    expect(replay.status).toBe(303)
    expect(replay.headers.get('location')).toMatch(/^\/lti\/error\?code=/)
    expect(rawSetCookies(replay).some((h) => h.startsWith('user_session='))).toBe(false)
  })
})
