import { createHash, randomBytes } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import { learnerToken, request } from './harness'

// The agent's OAuth 2.0 + PKCE flow against the built app (Task 21): an
// activity page sends the learner to authorize, exchanges the code for a token
// with its PKCE verifier, then records and reads progress with that token. The
// test database's allowlist is empty, so every activity URL is admitted and the
// activity is created on first use.

const ACTIVITY_URL = 'https://content.session.test/agent-activity'

const base64url = (buffer: Buffer) => buffer.toString('base64url')

/** Authorizes the seeded learner for the activity; returns the code and its verifier. */
const authorize = async () => {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(12))
  const response = await request(
    `/routes/agent/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: ACTIVITY_URL,
      redirect_uri: ACTIVITY_URL,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`,
    { headers: { cookie: `user_session=${await learnerToken()}` } }
  )
  expect(response.status).toBe(307)
  const back = new URL(response.headers.get('location') as string)
  expect(`${back.origin}${back.pathname}`).toBe(ACTIVITY_URL)
  expect(back.searchParams.get('state')).toBe(state)
  expect(back.searchParams.get('error')).toBeNull()
  return { code: back.searchParams.get('code') as string, verifier }
}

const exchange = (code: string, codeVerifier: string) =>
  request('/routes/agent/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: ACTIVITY_URL,
      redirect_uri: ACTIVITY_URL,
      code_verifier: codeVerifier,
    }),
  })

describe('agent flow: authorize → token → progress', () => {
  test('a signed-in learner completes the flow and their progress is recorded', async () => {
    const { code, verifier } = await authorize()
    const token = await exchange(code, verifier)
    expect(token.status).toBe(200)
    const { access_token } = (await token.json()) as { access_token: string }
    expect(access_token.length).toBeGreaterThan(20)

    const activity = (body: unknown) =>
      request('/routes/agent/activity', {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    const set = await activity({
      op: 'set-progress',
      progress_for_current_page: 0.5,
      increments_for_other_pages: [],
    })
    expect(set.status).toBe(200)

    const get = await activity({ op: 'get-progress' })
    expect(get.status).toBe(200)
    expect(JSON.stringify(await get.json())).toContain('0.5')
  })

  test('a wrong PKCE verifier is refused, and the code is then spent', async () => {
    const { code, verifier } = await authorize()
    expect((await exchange(code, base64url(randomBytes(32)))).status).toBe(400)
    expect((await exchange(code, verifier)).status).toBe(400)
  })

  test('the activity endpoint refuses a request without a token', async () => {
    const response = await request('/routes/agent/activity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'get-progress' }),
    })
    expect(response.status).toBe(401)
  })
})
