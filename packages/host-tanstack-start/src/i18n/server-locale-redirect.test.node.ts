import { describe, expect, test } from 'vitest'

import { negotiateLocaleRedirect } from './server-locale-redirect'

const BASE = 'https://modulus.test'

const request = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`${BASE}${path}`, { method, headers })

const redirect = (response: Response | null) =>
  response == null ? null : [response.status, response.headers.get('location')]

describe('negotiateLocaleRedirect', () => {
  test('a bare path with an es cookie → 302 to the es prefix (query kept)', () => {
    expect(
      redirect(negotiateLocaleRedirect(request('/sign-in?x=1', { cookie: 'lng=es' })))
    ).toEqual([302, `${BASE}/es/sign-in?x=1`])
    expect(redirect(negotiateLocaleRedirect(request('/', { cookie: 'a=b; lng=es' })))).toEqual([
      302,
      `${BASE}/es`,
    ])
  })

  test('a bare path with Accept-Language es and no cookie → 302', () => {
    expect(
      redirect(negotiateLocaleRedirect(request('/about', { 'accept-language': 'es-MX,es;q=0.9' })))
    ).toEqual([302, `${BASE}/es/about`])
  })

  test('a default-locale preference stays on the clean URL', () => {
    expect(negotiateLocaleRedirect(request('/about', { cookie: 'lng=en' }))).toBeNull()
    expect(negotiateLocaleRedirect(request('/about'))).toBeNull()
  })

  test('an externally typed /en/… → 301 to the clean form', () => {
    expect(redirect(negotiateLocaleRedirect(request('/en/sign-in?x=1')))).toEqual([
      301,
      `${BASE}/sign-in?x=1`,
    ])
    expect(redirect(negotiateLocaleRedirect(request('/en')))).toEqual([301, `${BASE}/`])
  })

  test('the URL wins: an explicit /es/… is never redirected, whatever the cookie', () => {
    expect(negotiateLocaleRedirect(request('/es/sign-in', { cookie: 'lng=en' }))).toBeNull()
  })

  test('GET only: a POST is never redirected', () => {
    expect(negotiateLocaleRedirect(request('/sign-in', { cookie: 'lng=es' }, 'POST'))).toBeNull()
  })

  test.each(['/lti/error', '/routes/lti/launch', '/auth/renew', '/_serverFn/x', '/favicon.ico'])(
    'never touches the non-localized path %s',
    (path) => {
      expect(negotiateLocaleRedirect(request(path, { cookie: 'lng=es' }))).toBeNull()
    }
  )

  test('a tampered cookie or malformed header falls back to the default', () => {
    expect(negotiateLocaleRedirect(request('/about', { cookie: 'lng=xx' }))).toBeNull()
    expect(negotiateLocaleRedirect(request('/about', { cookie: 'lng=%E0%A4%A' }))).toBeNull()
    expect(negotiateLocaleRedirect(request('/about', { 'accept-language': '!!!' }))).toBeNull()
  })
})
