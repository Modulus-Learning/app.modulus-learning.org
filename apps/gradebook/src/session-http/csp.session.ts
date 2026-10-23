import { describe, expect, test } from 'vitest'

import { request } from './harness'

// CSP enabled (review R4): ordinary pages carry their policy, including
// `frame-ancestors 'none'`; the pages an LMS frames carry none, so Canvas can
// embed them and the deep-link form can submit to the LMS.

const csp = async (path: string) => {
  const response = await request(path)
  return { status: response.status, header: response.headers.get('content-security-policy') }
}

describe('CSP with VITE_CSP_ENABLED=true', () => {
  test.each(['/sign-in', '/admin/sign-in'])(
    '%s takes the strict, nonce-based policy',
    async (path) => {
      const { status, header } = await csp(path)
      expect(status).toBe(200)
      expect(header).toMatch(/'nonce-[^']+'/)
      expect(header).toContain("frame-ancestors 'none'")
    }
  )

  test('/about takes the relaxed policy', async () => {
    const { status, header } = await csp('/about')
    expect(status).toBe(200)
    expect(header).toContain("frame-ancestors 'none'")
    expect(header).not.toMatch(/'nonce-/)
  })

  test.each([
    '/lti/error?code=invalid_request',
    '/agent/error?code=invalid_request',
    '/auth/renew?return=%2Fdashboard',
  ])('%s (framed by the LMS) carries no policy', async (path) => {
    const { status, header } = await csp(path)
    expect(status).toBe(200)
    expect(header).toBeNull()
  })
})
