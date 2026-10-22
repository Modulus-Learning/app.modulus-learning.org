import { describe, expect, test } from 'vitest'

import { form, location, MODE, request } from './client'

// Spec: Non-Negotiable Contract 4. A blocked surface is a plain 404 in every
// request shape; an admin instance sends the apex to /admin/sign-in.
describe.runIf(MODE === 'frontend')('frontend instance blocks the admin surface', () => {
  test.each(['/admin', '/admin/sign-in', '/es/admin/users'])('GET %s → 404', async (path) => {
    expect((await request(path)).status).toBe(404)
  })

  test('POST /routes/admin/refresh → 404', async () => {
    const response = await request('/routes/admin/refresh', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.status).toBe(404)
  })

  test('GET /routes/elb-status stays 200', async () => {
    expect((await request('/routes/elb-status')).status).toBe(200)
  })
})

describe.runIf(MODE === 'admin')('admin instance blocks the frontend surface', () => {
  test.each(['/', '/es'])('GET %s → redirect to /admin/sign-in', async (path) => {
    const response = await request(path)
    expect([302, 307]).toContain(response.status)
    expect(location(response)).toBe('/admin/sign-in')
  })

  test.each([
    '/sign-in',
    '/dashboard',
    '/es/sign-in',
    '/lti/error?code=invalid_request',
    '/agent/error?code=invalid_request',
    '/routes/lti/jwks',
    '/routes/auth/session',
    '/routes/oauth/github',
  ])('GET %s → 404', async (path) => {
    expect((await request(path)).status).toBe(404)
  })

  test('POST /routes/lti/launch → 404 (body never processed)', async () => {
    const response = await request('/routes/lti/launch', form({ id_token: 'x', state: 'y' }))
    expect(response.status).toBe(404)
  })

  test('OPTIONS /routes/agent/activity → 404', async () => {
    expect((await request('/routes/agent/activity', { method: 'OPTIONS' })).status).toBe(404)
  })

  test('GET /routes/elb-status stays 200', async () => {
    expect((await request('/routes/elb-status')).status).toBe(200)
  })
})
