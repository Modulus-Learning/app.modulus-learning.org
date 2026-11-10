import { beforeAll, describe, expect, test } from 'vitest'

import {
  ADMIN,
  adminToken,
  callFormFn,
  callGetFn,
  callPostFn,
  cookieAttributes,
  cookieValue,
  expiredAt,
  rawSetCookies,
  setCookieNamed,
} from './harness'

// Admin cookie-pair transport (Task 21 — admin explicit renewal): a real
// password sign-in issues the admin pair (SameSite=Lax in the fixture); the
// explicit renewal server function issues a new pair from the refresh cookie,
// with no self-fetch. Each raw Set-Cookie header and its attributes are checked.

const adminCookie = (header: string | undefined) => {
  expect(header, 'cookie issued').toBeDefined()
  expect(cookieAttributes(header as string)).toEqual(
    expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/'])
  )
  expect(cookieValue(header as string).length).toBeGreaterThan(20)
  return cookieValue(header as string)
}

let refresh: string

beforeAll(async () => {
  const form = new FormData()
  form.set('email', ADMIN.email)
  form.set('password', ADMIN.password)
  const response = await callFormFn('signInAdminFn', form, undefined)
  expect(response.status).toBe(200)
  adminCookie(setCookieNamed(response, 'admin_session'))
  refresh = adminCookie(setCookieNamed(response, 'admin_refresh'))
})

describe('admin sign-in and renewal', () => {
  test('a wrong password issues no cookies', async () => {
    const form = new FormData()
    form.set('email', ADMIN.email)
    form.set('password', 'Wrong-Password-9')
    const response = await callFormFn('signInAdminFn', form, undefined)
    expect(rawSetCookies(response).filter((h) => h.startsWith('admin_'))).toEqual([])
  })

  test('renewal with an expired access token issues a new admin pair', async () => {
    const response = await callPostFn(
      'renewAdminSession',
      {},
      `admin_session=${await adminToken(expiredAt())}; admin_refresh=${refresh}`
    )
    expect(response.status).toBe(200)
    const session = adminCookie(setCookieNamed(response, 'admin_session'))
    adminCookie(setCookieNamed(response, 'admin_refresh'))

    const verified = await callGetFn('getAdminSessionFn', {}, `admin_session=${session}`)
    expect(verified.status).toBe(200)
    expect(await verified.text()).toContain(ADMIN.id)
  })

  test('an invalid refresh cookie renews nothing and clears nothing', async () => {
    const response = await callPostFn(
      'renewAdminSession',
      {},
      `admin_session=${await adminToken(expiredAt())}; admin_refresh=not-a-refresh-token`
    )
    expect(response.status).toBe(200)
    expect(rawSetCookies(response).filter((h) => h.startsWith('admin_'))).toEqual([])
  })
})
