import { describe, expect, test } from 'vitest'

import { AGENT_CORS, AGENT_TOKEN_CORS, form, headersOf, location, request, serves } from './client'

const ACTIVITY = 'https://activity.test/course/page'

const authorize = (params: Record<string, string>) =>
  request(`/routes/agent/authorize?${new URLSearchParams(params)}`)

const validAuthorizeParams = {
  response_type: 'code',
  client_id: ACTIVITY,
  redirect_uri: ACTIVITY,
  state: 'state-123',
  code_challenge: 'challenge',
  code_challenge_method: 'S256',
}

describe.runIf(serves('frontend'))('agent endpoints', () => {
  test('OPTIONS /routes/agent/activity → 200 with CORS headers', async () => {
    const response = await request('/routes/agent/activity', { method: 'OPTIONS' })
    expect(response.status).toBe(200)
    expect(headersOf(response, Object.keys(AGENT_CORS))).toEqual(AGENT_CORS)
  })

  test('POST /routes/agent/activity without a bearer token → 401 with CORS', async () => {
    const response = await request('/routes/agent/activity', {
      method: 'POST',
      body: JSON.stringify({ op: 'get-progress' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ status: 'unauthorized' })
    expect(headersOf(response, Object.keys(AGENT_CORS))).toEqual(AGENT_CORS)
  })

  test('POST /routes/agent/activity with an invalid bearer token → 401', async () => {
    const response = await request('/routes/agent/activity', {
      method: 'POST',
      body: JSON.stringify({ op: 'get-progress' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-jwt' },
    })
    expect(response.status).toBe(401)
  })

  test('POST /routes/agent/token with a malformed request → 400 with CORS', async () => {
    const response = await request('/routes/agent/token', form({ grant_type: 'password' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'error -- malformed token request' })
    expect(headersOf(response, Object.keys(AGENT_TOKEN_CORS))).toEqual(AGENT_TOKEN_CORS)
  })

  test('GET /routes/agent/authorize without a usable redirect_uri → 307 /agent/error', async () => {
    const response = await authorize({ ...validAuthorizeParams, redirect_uri: 'ftp://x.test' })
    expect(response.status).toBe(307)
    expect(location(response)).toBe('/agent/error?code=invalid_request')
  })

  test('GET /routes/agent/authorize with missing parameters → 307 back with error=invalid_request', async () => {
    const { code_challenge: _omit, ...params } = validAuthorizeParams
    const response = await authorize(params)
    expect(response.status).toBe(307)
    expect(location(response)).toBe(`${ACTIVITY}?state=state-123&error=invalid_request`)
  })

  test('GET /routes/agent/authorize with client_id ≠ redirect_uri → error=invalid_request', async () => {
    const response = await authorize({ ...validAuthorizeParams, client_id: 'https://other.test' })
    expect(response.status).toBe(307)
    expect(location(response)).toBe(`${ACTIVITY}?state=state-123&error=invalid_request`)
  })

  test('GET /routes/agent/authorize without a learner session → error=access_denied', async () => {
    const response = await authorize(validAuthorizeParams)
    expect(response.status).toBe(307)
    expect(location(response)).toBe(`${ACTIVITY}?state=state-123&error=access_denied`)
  })

  test('GET /agent/error?code=invalid_request → 200 chromeless page', async () => {
    const response = await request('/agent/error?code=invalid_request')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })
})
