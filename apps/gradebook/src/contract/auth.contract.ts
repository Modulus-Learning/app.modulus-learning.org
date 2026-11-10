import { describe, expect, test } from 'vitest'

import { byTarget, request, serves, setCookies } from './client'

const NO_STORE = 'private, no-cache, no-store, max-age=0, must-revalidate'

describe.runIf(serves('frontend'))('GET /routes/auth/session', () => {
  test('no cookies → 200 null, uncacheable, no Set-Cookie', async () => {
    const response = await request('/routes/auth/session')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(NO_STORE)
    expect(await response.json()).toBeNull()
    expect(setCookies(response)).toEqual([])
  })

  test('an invalid access cookie → 200 null, no Set-Cookie', async () => {
    const response = await request('/routes/auth/session', {
      headers: { cookie: 'user_session=not-a-jwt' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
    expect(setCookies(response)).toEqual([])
  })

  // Deliberate change (spec: Legacy Session Endpoints). The Next handler
  // attempts a refresh when only a refresh cookie is present; the Start handler
  // is verification-only and reports `renewable` instead. With an invalid
  // refresh token neither writes a cookie.
  test('only a refresh cookie → 200 null, no Set-Cookie; Start reports renewable', async () => {
    const response = await request('/routes/auth/session', {
      headers: { cookie: 'user_refresh=not-a-jwt' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
    expect(setCookies(response)).toEqual([])
    expect(response.headers.get('x-modulus-session-renewable')).toBe(
      byTarget({ next: null, start: 'true' })
    )
  })
})

// Deliberate change (spec: Legacy Session Endpoints): both refresh endpoints
// are retired on Start. Their only caller was the Next proxy's self-fetch.
describe('legacy refresh endpoints', () => {
  const cases = [
    ['/routes/auth/refresh', 'frontend'],
    ['/routes/admin/refresh', 'admin'],
  ] as const

  for (const [path, surface] of cases) {
    test.runIf(serves(surface))(`POST ${path} with an invalid body`, async () => {
      const response = await request(path, {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status).toBe(byTarget({ next: 400, start: 404 }))
    })

    test.runIf(serves(surface))(`POST ${path} with an invalid refresh token`, async () => {
      const response = await request(path, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'not-a-jwt' }),
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status).toBe(byTarget({ next: 403, start: 404 }))
      expect(setCookies(response)).toEqual([])
    })
  }
})
