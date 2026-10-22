import { NextRequest } from 'next/server'

import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAuthCode: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreUserRequestContext: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreUserRequestContext: mocks.getCoreUserRequestContext,
}))
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}))

import { GET } from './route'

const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
const REDIRECT_URI = 'https://content.test/activity'

const makeRequest = (scopeId?: string): NextRequest => {
  const url = new URL('https://gradebook.test/routes/agent/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: REDIRECT_URI,
    redirect_uri: REDIRECT_URI,
    state: 'state-value',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    ...(scopeId === undefined ? {} : { scope_id: scopeId }),
  }).toString()
  return new NextRequest(url)
}

/** The `Location` header of a redirect response, as a URL. */
const locationOf = (response: Response): URL => {
  const location = response.headers.get('location')
  expect(location).not.toBeNull()
  return new URL(location as string)
}

describe('agent authorization route scope selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      agent: { auth: { createAuthCode: mocks.createAuthCode } },
    })
    mocks.createAuthCode.mockResolvedValue({ ok: true, data: { code: 'authorization-code' } })
  })

  test('normalizes a missing scope label to the default sentinel', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(307)
    expect(mocks.createAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope_id: DEFAULT_SCOPE_ID })
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { scope_id: DEFAULT_SCOPE_ID, source: 'default' },
      'agent authorization scope selected'
    )
  })

  test('passes a structurally valid client-selected scope to core', async () => {
    await GET(makeRequest(SCOPE_ID))

    expect(mocks.createAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope_id: SCOPE_ID })
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { scope_id: SCOPE_ID, source: 'client' },
      'agent authorization scope selected'
    )
  })

  test('rejects a malformed scope before creating an authorization code', async () => {
    // Was a raw 400 JSON body; now a bounce back to the learner's page. What it
    // rejects is unchanged -- only the response is.
    const response = await GET(makeRequest('not-a-uuid'))

    expect(response.status).toBe(307)
    expect(locationOf(response).searchParams.get('error')).toBe('invalid_request')
    expect(mocks.createAuthCode).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { scope_id_present: true },
      'malformed agent authorization scope label'
    )
    expect(mocks.loggerInfo).not.toHaveBeenCalled()
  })

  test('reports an unknown scope from core as invalid authorization input', async () => {
    mocks.createAuthCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_VALIDATION', message: 'Unknown scope' },
    })

    const response = await GET(makeRequest(SCOPE_ID))

    expect(response.status).toBe(307)
    expect(locationOf(response).searchParams.get('error')).toBe('invalid_request')
  })
})

/** Builds a request with individual parameters overridden or removed. */
const makeRequestWith = (overrides: Record<string, string | null>): NextRequest => {
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: REDIRECT_URI,
    redirect_uri: REDIRECT_URI,
    state: 'state-value',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete params[key]
    } else {
      params[key] = value
    }
  }

  const url = new URL('https://gradebook.test/routes/agent/authorize')
  url.search = new URLSearchParams(params).toString()
  return new NextRequest(url)
}

describe('agent authorization redirect uri validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      agent: { auth: { createAuthCode: mocks.createAuthCode } },
    })
    mocks.createAuthCode.mockResolvedValue({ ok: true, data: { code: 'authorization-code' } })
  })

  test.each([
    ['a javascript: url', 'javascript:alert(1)'],
    ['a data: url', 'data:text/html,x'],
    ['a credentialed-host disguise', 'https://modulus.example@evil.example/'],
    ['a value new URL() cannot parse', 'not a url at all'],
    ['insecure http on a remote host', 'http://content.example/activity'],
  ])('sends %s to the error page and never to the supplied value', async (_label, redirect_uri) => {
    const response = await GET(makeRequestWith({ redirect_uri, client_id: redirect_uri }))

    expect(response.status).toBe(307)

    // The whole Location, not a prefix. A weaker assertion would pass while an
    // extra parameter carried the rejected value into the page -- Next
    // serializes the request URL into the RSC flight payload of the served
    // HTML, so anything in this query string reaches the response body.
    const location = locationOf(response)
    expect(`${location.pathname}${location.search}`).toBe('/agent/error?code=invalid_request')
    expect(location.origin).toBe('https://gradebook.test')

    // ...and nothing anywhere in the header echoes what was submitted.
    expect(location.href).not.toContain(redirect_uri)
    expect(location.href).not.toContain(encodeURIComponent(redirect_uri))
  })

  test('never reaches core for an unusable redirect uri', async () => {
    // A distinct obligation from "does not redirect there": at most one core
    // call per request, on the authenticated branch only.
    for (const redirect_uri of [
      'javascript:alert(1)',
      'data:text/html,x',
      'https://modulus.example@evil.example/',
      'not a url at all',
    ]) {
      await GET(makeRequestWith({ redirect_uri, client_id: redirect_uri }))
    }

    expect(mocks.createAuthCode).not.toHaveBeenCalled()
  })

  test('does not crash on a value that used to throw inside new URL()', async () => {
    // The unhandled 500 this replaces: the route parsed `redirect_uri` before
    // anything had checked it.
    const response = await GET(makeRequestWith({ redirect_uri: '', client_id: '' }))

    expect(response.status).toBe(307)
    const location = locationOf(response)
    expect(`${location.pathname}${location.search}`).toBe('/agent/error?code=invalid_request')
  })

  test('logs the rejection without the rejected value', async () => {
    await GET(
      makeRequestWith({
        redirect_uri: 'https://modulus.example@evil.example/?token=secret-token-value',
        client_id: 'https://modulus.example@evil.example/?token=secret-token-value',
      })
    )

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { redirect_uri_present: true },
      'agent authorization rejected an unusable redirect uri'
    )
  })
})

describe('agent authorization error bounces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      agent: { auth: { createAuthCode: mocks.createAuthCode } },
    })
    mocks.createAuthCode.mockResolvedValue({ ok: true, data: { code: 'authorization-code' } })
  })

  test.each([
    ['a wrong response_type', { response_type: 'token' }],
    ['a missing code_challenge', { code_challenge: null }],
    ['a wrong code_challenge_method', { code_challenge_method: 'plain' }],
    ['a missing client_id', { client_id: null }],
  ])('bounces back with state and invalid_request for %s', async (_label, overrides) => {
    // Was raw 400 JSON, which no learner should ever see.
    const response = await GET(makeRequestWith(overrides))

    expect(response.status).toBe(307)
    const location = locationOf(response)
    expect(location.origin + location.pathname).toBe(REDIRECT_URI)
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('state')).toBe('state-value')
    expect(mocks.createAuthCode).not.toHaveBeenCalled()
  })

  test('bounces without state when state itself is missing', async () => {
    // There is no state to echo. The agent reads that as
    // `oauth_state_mismatch` and fails, which is acceptable: a request without
    // state came from a broken client, not from a learner condition.
    const response = await GET(makeRequestWith({ state: null }))

    expect(response.status).toBe(307)
    const location = locationOf(response)
    expect(location.origin + location.pathname).toBe(REDIRECT_URI)
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('state')).toBeNull()
  })

  test('still rejects a client_id that does not match the redirect uri', async () => {
    // A guard that the reorder did not quietly drop the existing check.
    const response = await GET(makeRequestWith({ client_id: 'https://other.test/activity' }))

    expect(response.status).toBe(307)
    expect(locationOf(response).searchParams.get('error')).toBe('invalid_request')
    expect(mocks.createAuthCode).not.toHaveBeenCalled()
  })

  test.each([
    ['an explicit default port', 'https://content.test:443/activity'],
    ['an uppercase scheme and host', 'HTTPS://CONTENT.TEST/activity'],
    ['a callback query', `${REDIRECT_URI}?section=2`],
  ])(
    'rejects a client_id that differs from the redirect uri only by %s',
    async (_label, client_id) => {
      // Both name the same activity, but OAuth binds the values as sent. The
      // comparison is exact; only core's activity lookup is canonical.
      const response = await GET(makeRequestWith({ client_id }))

      expect(response.status).toBe(307)
      expect(locationOf(response).searchParams.get('error')).toBe('invalid_request')
      expect(mocks.createAuthCode).not.toHaveBeenCalled()
    }
  )

  test('passes a non-canonical, query-bearing callback pair to core exactly as received', async () => {
    // The instructor restriction on queries and fragments does not apply to
    // OAuth callbacks, and the route does not canonicalize either value.
    const value = 'https://content.test:443/activity?section=2'

    await GET(makeRequestWith({ client_id: value, redirect_uri: value }))

    expect(mocks.createAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ client_id: value, redirect_uri: value })
    )
  })

  test('bounces with access_denied when there is no Modulus session', async () => {
    mocks.getCoreUserRequestContext.mockResolvedValue(null)

    const response = await GET(makeRequestWith({}))

    const location = locationOf(response)
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('state-value')
    expect(mocks.createAuthCode).not.toHaveBeenCalled()
  })

  test('bounces with unauthorized_client, not access_denied, for a denied activity url', async () => {
    // Not a style choice. The agent maps `access_denied` to `status: 'expired'`
    // and prompts a re-launch from the LMS, which for an activity the allowlist
    // does not admit sends the learner round the same loop forever.
    // `unauthorized_client` terminates at `status: 'failed'`.
    mocks.createAuthCode.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'This activity URL is not allowed by the sitewide allowlist.',
        details: { rejected: [{ url: REDIRECT_URI, reason: 'activity_url_not_allowed' }] },
      },
    })

    const response = await GET(makeRequestWith({}))

    const location = locationOf(response)
    expect(location.searchParams.get('error')).toBe('unauthorized_client')
    expect(location.searchParams.get('error')).not.toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('state-value')
    expect(location.searchParams.get('code')).toBeNull()
  })

  test('bounces with server_error for any other core failure', async () => {
    mocks.createAuthCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_DATABASE', message: 'database error' },
    })

    const response = await GET(makeRequestWith({}))

    expect(locationOf(response).searchParams.get('error')).toBe('server_error')
  })

  test('bounces with state and code on success', async () => {
    const response = await GET(makeRequestWith({}))

    const location = locationOf(response)
    expect(response.status).toBe(307)
    expect(location.origin + location.pathname).toBe(REDIRECT_URI)
    expect(location.searchParams.get('code')).toBe('authorization-code')
    expect(location.searchParams.get('state')).toBe('state-value')
    expect(location.searchParams.get('error')).toBeNull()
  })
})
