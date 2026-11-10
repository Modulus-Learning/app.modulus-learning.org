import { describe, expect, test } from 'vitest'

import { byTarget, location, request, serves } from './client'

describe.runIf(serves('frontend'))('locale URLs', () => {
  test('GET /es/sign-in with no cookie → 200', async () => {
    const response = await request('/es/sign-in', { headers: { 'accept-language': 'en' } })
    expect(response.status).toBe(200)
  })

  test('GET /sign-in with Accept-Language es and no cookie → redirect to /es/sign-in', async () => {
    const response = await request('/sign-in', { headers: { 'accept-language': 'es' } })
    expect(response.status).toBe(byTarget({ next: 307, start: 302 }))
    expect(location(response)).toBe('/es/sign-in')
  })

  test('GET /sign-in with an es cookie → redirect to /es/sign-in', async () => {
    const response = await request('/sign-in', { headers: { cookie: 'lng=es' } })
    expect(response.status).toBe(byTarget({ next: 307, start: 302 }))
    expect(location(response)).toBe('/es/sign-in')
  })

  // Deliberate change (spec: Internationalisation → "The URL wins"). Next lets
  // the cookie override an explicit prefix; Start treats the prefix as canonical.
  test('GET /es/sign-in with an en cookie', async () => {
    const response = await request('/es/sign-in', { headers: { cookie: 'lng=en' } })
    expect(response.status).toBe(byTarget({ next: 307, start: 200 }))
    if (byTarget({ next: true, start: false })) {
      expect(location(response)).toBe('/sign-in')
    }
  })

  // Deliberate change (spec: Internationalisation → canonicalisation).
  test('GET /en/sign-in with no cookie', async () => {
    const response = await request('/en/sign-in', { headers: { 'accept-language': 'en' } })
    expect(response.status).toBe(byTarget({ next: 200, start: 301 }))
    if (byTarget({ next: false, start: true })) {
      expect(location(response)).toBe('/sign-in')
    }
  })

  test('GET /xx/sign-in (unknown prefix) → 404', async () => {
    const response = await request('/xx/sign-in', { headers: { 'accept-language': 'en' } })
    expect(response.status).toBe(404)
  })

  test('POST to a bare page path is never locale-redirected on Start', async () => {
    const response = await request('/sign-in', {
      method: 'POST',
      headers: { cookie: 'lng=es', 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    })
    // Next applies withI18n to every method; Start negotiates GET only.
    if (byTarget({ next: false, start: true })) {
      expect(location(response)).not.toBe('/es/sign-in')
    }
  })
})
