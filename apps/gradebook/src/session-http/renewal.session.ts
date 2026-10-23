import { beforeAll, describe, expect, test } from 'vitest'

import {
  BOUNDARY_HEADER,
  callFormFn,
  callGetFn,
  callPostFn,
  cookieAttributes,
  cookieValue,
  LEARNER,
  learnerToken,
  rawSetCookies,
  setCookieNamed,
} from './harness'

// Successful cookie-pair transport (review: checkpoints 2 and 4). A real
// password sign-in issues the learner pair; renewal with its refresh cookie
// issues a new pair. Each raw Set-Cookie header and its attributes are checked
// against the fixture's learner cookie settings (SameSite=None, Secure,
// HttpOnly). A failed renewal never clears cookies.

const learnerCookie = (header: string | undefined) => {
  expect(header, 'cookie issued').toBeDefined()
  const attributes = cookieAttributes(header as string)
  expect(attributes).toContain('httponly')
  expect(attributes).toContain('secure')
  expect(attributes).toContain('samesite=none')
  expect(attributes).toContain('path=/')
  expect(cookieValue(header as string).length).toBeGreaterThan(20)
  return cookieValue(header as string)
}

const expired = () => Math.floor(Date.now() / 1000) - 60

let signedIn: { session: string; refresh: string }

beforeAll(async () => {
  const form = new FormData()
  form.set('email', LEARNER.email)
  form.set('password', LEARNER.password)
  form.set('callback_url', '')
  const response = await callFormFn('signInUserFn', form, undefined)
  expect(response.status).toBe(200)
  signedIn = {
    session: learnerCookie(setCookieNamed(response, 'user_session')),
    refresh: learnerCookie(setCookieNamed(response, 'user_refresh')),
  }
})

describe('learner sign-in', () => {
  test('issues exactly one session and one refresh cookie', () => {
    expect(signedIn.session).not.toBe(signedIn.refresh)
  })

  test('a wrong password issues no cookies', async () => {
    const form = new FormData()
    form.set('email', LEARNER.email)
    form.set('password', 'Wrong-Password-9')
    form.set('callback_url', '')
    const response = await callFormFn('signInUserFn', form, undefined)
    expect(rawSetCookies(response).filter((h) => h.startsWith('user_'))).toEqual([])
  })
})

describe('learner renewal', () => {
  test('an expired access token with a valid refresh cookie → remote read signals renew', async () => {
    const response = await callGetFn(
      'getActivityCodesFn',
      { data: [], context: { expectedPrincipal: { domain: 'user', userId: LEARNER.id } } },
      `user_session=${await learnerToken(expired())}; user_refresh=${signedIn.refresh}`
    )
    expect(response.status).toBe(401)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('renew')
  })

  test('renewal issues a new cookie pair', async () => {
    const response = await callPostFn(
      'renewUserSession',
      {},
      `user_session=${await learnerToken(expired())}; user_refresh=${signedIn.refresh}`
    )
    expect(response.status).toBe(200)
    // (Within one second of sign-in the new access token can be byte-identical:
    // same claims, same issue time, deterministic RS256.)
    learnerCookie(setCookieNamed(response, 'user_session'))
    learnerCookie(setCookieNamed(response, 'user_refresh'))
  })

  test('the renewed session verifies as the learner', async () => {
    const renewal = await callPostFn(
      'renewUserSession',
      {},
      `user_session=${await learnerToken(expired())}; user_refresh=${signedIn.refresh}`
    )
    const session = cookieValue(setCookieNamed(renewal, 'user_session') as string)
    const { request } = await import('./harness')
    // The seeded learner holds no roles, so its real tokens carry no abilities;
    // the session endpoint checks identity alone.
    const verified = await request('/routes/auth/session', {
      headers: { cookie: `user_session=${session}` },
    })
    expect(verified.status).toBe(200)
    expect((await verified.json())?.user?.id).toBe(LEARNER.id)
  })

  test('an invalid refresh cookie renews nothing and clears nothing', async () => {
    const response = await callPostFn(
      'renewUserSession',
      {},
      `user_session=${await learnerToken(expired())}; user_refresh=not-a-refresh-token`
    )
    expect(response.status).toBe(200)
    expect(rawSetCookies(response).filter((h) => h.startsWith('user_'))).toEqual([])
  })
})
