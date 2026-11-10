import { describe, expect, test } from 'vitest'

import { location, request, serves, TARGET } from './client'

describe.runIf(serves('frontend'))('learner pages', () => {
  test.each(['/', '/sign-in', '/sign-up', '/about', '/docs'])('GET %s → 200 html', async (path) => {
    const response = await request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  test('GET /dashboard without a session → redirect to sign-in with callbackUrl', async () => {
    const response = await request('/dashboard')
    expect([302, 307]).toContain(response.status)
    expect(location(response)).toBe('/sign-in?callbackUrl=%2Fdashboard')
  })

  test('GET /account without a session → redirect to sign-in with callbackUrl', async () => {
    const response = await request('/account')
    expect([302, 307]).toContain(response.status)
    expect(location(response)).toBe('/sign-in?callbackUrl=%2Faccount')
  })

  // Next first 308s `//` down to `/`, then redirects to /start-activity; the
  // contract is where the same-origin redirect chain ends, not its hop count.
  test('GET /https://activity.test/page → redirect chain ends at /start-activity/…', async () => {
    let path = '/https://activity.test/page'
    for (let hop = 0; hop < 3 && !path.startsWith('/start-activity/'); hop++) {
      const response = await request(path)
      expect([302, 307, 308]).toContain(response.status)
      path = location(response) ?? ''
    }
    expect(path).toMatch(/^\/start-activity\/https:\/\/?activity\.test\/page$/)
  })

  test('GET /no-such-page → 404', async () => {
    const response = await request('/no-such-page-contract')
    expect(response.status).toBe(404)
  })
})

describe.runIf(serves('admin'))('admin pages', () => {
  test('GET /admin/sign-in → 200 html', async () => {
    const response = await request('/admin/sign-in')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  test('GET /admin without a session → redirect to /admin/sign-in with callbackUrl', async () => {
    const response = await request('/admin')
    expect([302, 307]).toContain(response.status)
    expect(location(response)).toBe('/admin/sign-in?callbackUrl=%2Fadmin')
  })

  // Next's `withAdminAuth` recognises only an unprefixed `/admin/sign-in`, so
  // `/es/admin/sign-in` redirects to itself with a callbackUrl — a loop for
  // non-default-locale admins. Start keeps sign-in outside `_authed` (fixed).
  test.runIf(TARGET === 'start')('GET /es/admin/sign-in → 200 html (Next loops)', async () => {
    const response = await request('/es/admin/sign-in')
    expect(response.status).toBe(200)
  })
})
