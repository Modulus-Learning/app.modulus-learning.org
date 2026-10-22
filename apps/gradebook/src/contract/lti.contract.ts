import { describe, expect, test } from 'vitest'

import { form, location, request, serves } from './client'

describe.runIf(serves('frontend'))('LTI endpoints', () => {
  test('GET /routes/lti/jwks → 200 JWKS with RSA keys', async () => {
    const response = await request('/routes/lti/jwks')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { keys: Array<Record<string, unknown>> }
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.length).toBeGreaterThan(0)
    for (const key of body.keys) {
      expect(key).toMatchObject({ kty: 'RSA' })
      expect(typeof key.kid).toBe('string')
      expect(key).not.toHaveProperty('d') // never a private key
    }
  })

  test('POST /routes/lti/login with an invalid body → 303 /lti/error?code=invalid_request', async () => {
    const response = await request('/routes/lti/login', form({}))
    expect(response.status).toBe(303)
    expect(location(response)).toBe('/lti/error?code=invalid_request')
  })

  test('POST /routes/lti/launch with an invalid body → 303 /lti/error?code=invalid_request', async () => {
    const response = await request('/routes/lti/launch', form({}))
    expect(response.status).toBe(303)
    expect(location(response)).toBe('/lti/error?code=invalid_request')
  })

  test('POST /routes/lti/launch without its state cookie → 303 /lti/error?code=session_expired', async () => {
    const response = await request(
      '/routes/lti/launch',
      form({ id_token: 'not-a-real-token', state: 'no-such-state' })
    )
    expect(response.status).toBe(303)
    expect(location(response)).toBe('/lti/error?code=session_expired')
  })

  test('GET /routes/lti/deep-link/activities without a session → 401', async () => {
    const response = await request('/routes/lti/deep-link/activities?id=x')
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ status: 'failed', message: 'Not authenticated' })
  })

  test('GET /lti/error?code=invalid_request → 200 chromeless page', async () => {
    const response = await request('/lti/error?code=invalid_request')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  test('GET /routes/lti/register → page responds (not 404)', async () => {
    const response = await request('/routes/lti/register')
    expect(response.status).not.toBe(404)
    expect(response.status).toBeLessThan(500)
  })
})
