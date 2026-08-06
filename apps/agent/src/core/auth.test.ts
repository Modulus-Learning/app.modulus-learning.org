import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SCOPE_ID,
  OAUTH_SESSION_STORAGE_KEY,
  readOAuthSession,
  readTabContext,
  type StoredActivityContext,
  type StoredOAuthSession,
  TAB_CONTEXT_STORAGE_KEY,
} from './activity-context.js'
import { authenticate, createAuthorizationRequestParams, getQueryParams } from './auth.js'

const ISSUER = 'https://gradebook.test'
const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
const OTHER_SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90f'

class Navigation extends Error {
  constructor(readonly url: URL) {
    super('navigation')
  }
}

const registryResponse = () =>
  new Response(JSON.stringify({ installations: [{ 'site-url': ISSUER }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const tokenResponse = ({
  scope_id = SCOPE_ID,
  scope_name,
}: {
  scope_id?: string
  scope_name?: string
} = {}) =>
  new Response(
    JSON.stringify({
      api_base_url: 'https://gradebook.test/routes/agent',
      access_token: 'access-token',
      user: { id: 'opaque-user', full_name: 'Test User' },
      scope_id,
      ...(scope_name == null ? {} : { scope_name }),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )

const context = (overrides: Partial<StoredActivityContext> = {}): StoredActivityContext => ({
  version: 1,
  issuer: ISSUER,
  scope_id: SCOPE_ID,
  ...overrides,
})

const oauthSession = (overrides: Partial<StoredOAuthSession> = {}): StoredOAuthSession => ({
  version: 1,
  state: 'oauth-state',
  code_verifier: 'code-verifier',
  context: context(),
  return_location: {
    search: '?tag=one&tag=two&authored=yes',
    hash: '#section',
  },
  ...overrides,
})

const captureNavigation = () => {
  let navigation: Navigation | undefined
  const navigate = (url: URL) => {
    navigation = new Navigation(url)
    throw navigation
  }
  return {
    navigate,
    get navigation(): Navigation {
      if (navigation == null) throw new Error('navigation did not occur')
      return navigation
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/activity')
})

describe('agent activity query cleanup', () => {
  it('captures recognized launch fields and preserves unrelated queries and fragment', () => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}&authored=one&authored=two#section?scope_id=fragment-value`
    )

    const params = getQueryParams()

    expect(params.issuer).toBe(ISSUER)
    expect(params.scope_id).toBe(SCOPE_ID)
    expect(window.location.search).toBe('?authored=one&authored=two')
    expect(window.location.hash).toBe('#section?scope_id=fragment-value')
  })

  it('removes every recognized launch and OAuth parameter without reordering authored duplicates', () => {
    window.history.replaceState(
      null,
      '',
      `/activity?tag=one&state=s&tag=two&code=c&modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}&tag=three#error=fragment-only`
    )

    getQueryParams()

    expect(window.location.search).toBe('?tag=one&tag=two&tag=three')
    expect(window.location.hash).toBe('#error=fragment-only')
  })

  it('sends a scope label only when one was supplied to the request builder', () => {
    const common = {
      redirect_uri: 'https://content.test/activity',
      state: 'state',
      code_challenge: 'challenge',
    }

    expect(createAuthorizationRequestParams({ ...common, scope_id: SCOPE_ID })).toMatchObject({
      scope_id: SCOPE_ID,
    })
    expect(createAuthorizationRequestParams({ ...common, scope_id: undefined })).not.toHaveProperty(
      'scope_id'
    )
  })
})

describe('fresh launch and same-tab context', () => {
  it('commits one atomic issuer/scope pair before OAuth and saves the authored return location', async () => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}&tag=one&tag=two#section`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()).toEqual(context())
    const saved = readOAuthSession()
    expect(saved?.context).toEqual(context())
    expect(saved?.return_location).toEqual({
      search: '?tag=one&tag=two',
      hash: '#section',
    })

    const request = redirected.navigation.url
    const clientId = new URL(request.searchParams.get('client_id') ?? '')
    const redirectUri = new URL(request.searchParams.get('redirect_uri') ?? '')
    expect(clientId.search).toBe('')
    expect(clientId.hash).toBe('')
    expect(redirectUri.search).toBe('')
    expect(redirectUri.hash).toBe('')
    expect(request.searchParams.get('scope_id')).toBe(SCOPE_ID)
  })

  it('normalizes a fresh launch without a scope label to the sentinel', async () => {
    window.history.replaceState(null, '', `/activity?modulus=${encodeURIComponent(ISSUER)}`)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()?.scope_id).toBe(DEFAULT_SCOPE_ID)
    expect(redirected.navigation.url.searchParams.get('scope_id')).toBe(DEFAULT_SCOPE_ID)
  })

  it.each([
    ['invalid issuer', 'not-a-url', SCOPE_ID, 'invalid_issuer'],
    ['invalid scope', ISSUER, 'not-a-uuid', 'invalid_scope'],
  ])('fails safely for an %s in a fresh launch', async (_label, issuer, scopeId, expectedError) => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(issuer)}&scope_id=${scopeId}&authored=yes#part`
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: expectedError,
    })

    expect(readTabContext()).toBeNull()
    expect(window.location.search).toBe('?authored=yes')
    expect(window.location.hash).toBe('#part')
  })

  it('reuses the committed context across reload and same-tab navigation', async () => {
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    window.history.replaceState(null, '', '/next-page?authored=yes#part')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readOAuthSession()?.context).toEqual(context())
    expect(readOAuthSession()?.return_location).toEqual({
      search: '?authored=yes',
      hash: '#part',
    })
  })

  it.each([
    ['malformed JSON', '{'],
    ['invalid issuer', JSON.stringify({ version: 1, issuer: 'not a url', scope_id: SCOPE_ID })],
    ['invalid UUID', JSON.stringify({ version: 1, issuer: ISSUER, scope_id: 'not-a-uuid' })],
    ['unsupported version', JSON.stringify({ version: 2, issuer: ISSUER, scope_id: SCOPE_ID })],
  ])('clears a %s tab record without throwing', async (_label, serialized) => {
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, serialized)

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })

    expect(window.sessionStorage.getItem(TAB_CONTEXT_STORAGE_KEY)).toBeNull()
  })

  it('removes the unsupported issuer-only storage shape without reading it', async () => {
    window.localStorage.setItem('modulus_base_url', ISSUER)

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })

    expect(window.localStorage.getItem('modulus_base_url')).toBeNull()
  })
})

describe('OAuth response restoration', () => {
  it('uses the exact pre-redirect context, restores duplicates and fragment, and refreshes the name', async () => {
    const saved = oauthSession()
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(saved))
    window.sessionStorage.setItem(
      TAB_CONTEXT_STORAGE_KEY,
      JSON.stringify(context({ scope_id: OTHER_SCOPE_ID, scope_name: 'Other Scope' }))
    )
    window.history.replaceState(
      null,
      '',
      '/activity?state=oauth-state&code=auth-code&error_description=remove-me'
    )

    let tokenRequestUrl: string | undefined
    let tokenRequest: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        tokenRequestUrl = String(input)
        tokenRequest = init
        return tokenResponse({ scope_name: 'Autumn 2026' })
      })
    )

    const result = await authenticate(undefined)

    expect(result).toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
      scope_name: 'Autumn 2026',
    })
    expect(window.location.search).toBe('?tag=one&tag=two&authored=yes')
    expect(window.location.hash).toBe('#section')
    expect(window.sessionStorage.getItem(OAUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(readTabContext()).toEqual(context({ scope_name: 'Autumn 2026' }))
    expect(tokenRequestUrl).toBe('https://gradebook.test/routes/agent/token')

    const body = new URLSearchParams(String(tokenRequest?.body))
    const clientId = new URL(body.get('client_id') ?? '')
    const redirectUri = new URL(body.get('redirect_uri') ?? '')
    expect(clientId.search).toBe('')
    expect(clientId.hash).toBe('')
    expect(redirectUri.search).toBe('')
    expect(redirectUri.hash).toBe('')
  })

  it('restores the authored return location for an OAuth error response', async () => {
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(oauthSession()))
    window.history.replaceState(
      null,
      '',
      '/activity?state=oauth-state&error=access_denied&error_description=session-ended'
    )

    const result = await authenticate(undefined)

    expect(result).toEqual({ status: 'expired' })
    expect(window.location.search).toBe('?tag=one&tag=two&authored=yes')
    expect(window.location.hash).toBe('#section')
    expect(window.sessionStorage.getItem(OAUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('allows scope_name to be absent without changing scope identity', async () => {
    window.sessionStorage.setItem(
      OAUTH_SESSION_STORAGE_KEY,
      JSON.stringify(oauthSession({ context: context({ scope_name: 'Old Name' }) }))
    )
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse())
    )

    const result = await authenticate(undefined)

    expect(result).toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
      scope_name: null,
    })
    expect(readTabContext()).toEqual(context())
  })

  it('rejects a token response that names a different scope', async () => {
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(oauthSession()))
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_id: OTHER_SCOPE_ID }))
    )

    const result = await authenticate(undefined)

    expect(result).toEqual({ status: 'failed', error: 'token_scope_mismatch' })
  })

  it('clears a malformed OAuth session and fails without throwing', async () => {
    window.sessionStorage.setItem(
      OAUTH_SESSION_STORAGE_KEY,
      JSON.stringify({ ...oauthSession(), version: 2 })
    )
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')

    const result = await authenticate(undefined)

    expect(result).toEqual({ status: 'failed', error: 'oauth_state_mismatch' })
    expect(window.sessionStorage.getItem(OAUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.location.search).toBe('')
  })
})
