import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SCOPE_ID,
  OAUTH_SESSION_STORAGE_KEY,
  readOAuthSession,
  readSharedContext,
  readTabContext,
  SHARED_CONTEXT_STORAGE_KEY,
  type StoredActivityContext,
  type StoredOAuthSession,
  TAB_CONTEXT_STORAGE_KEY,
} from './activity-context.js'
import { authenticate, createAuthorizationRequestParams, getQueryParams } from './auth.js'

const ISSUER = 'https://gradebook.test'
const OTHER_ISSUER = 'https://other-gradebook.test'
const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
const OTHER_SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90f'

class Navigation extends Error {
  constructor(readonly url: URL) {
    super('navigation')
  }
}

const registryResponse = (issuers = [ISSUER]) =>
  new Response(
    JSON.stringify({ installations: issuers.map((issuer) => ({ 'site-url': issuer })) }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )

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

const setForegroundState = ({
  visibility = 'visible',
  focused = true,
}: {
  visibility?: DocumentVisibilityState
  focused?: boolean
} = {}) => {
  const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility)
  const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
  return { visibilityState, hasFocus }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/activity')
  setForegroundState()
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

describe('foreground publication lifecycle', () => {
  it('installs one visibility listener and one focus listener across initialization', async () => {
    const documentListener = vi.spyOn(document, 'addEventListener')
    const windowListener = vi.spyOn(window, 'addEventListener')

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })
    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })

    expect(
      documentListener.mock.calls.filter(([event]) => event === 'visibilitychange')
    ).toHaveLength(1)
    expect(windowListener.mock.calls.filter(([event]) => event === 'focus')).toHaveLength(1)
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
    expect(readSharedContext()).toEqual(context())
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

  it('compares same-tab history before shared history for an explicit launch switch', async () => {
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    window.localStorage.setItem(
      SHARED_CONTEXT_STORAGE_KEY,
      JSON.stringify(context({ scope_id: OTHER_SCOPE_ID }))
    )
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${DEFAULT_SCOPE_ID}`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const log = vi.fn(async () => {})
    const redirected = captureNavigation()

    await expect(authenticate({ log }, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(log).toHaveBeenCalledWith('Fresh launch changed the activity context', {
      history: 'tab',
      previous_scope_id: SCOPE_ID,
      scope_id: DEFAULT_SCOPE_ID,
      issuer_changed: false,
    })
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

describe('foreground context inheritance', () => {
  it('keeps a background fresh launch tab-local until that tab is foregrounded', async () => {
    const foreground = setForegroundState({ visibility: 'visible', focused: false })
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${OTHER_SCOPE_ID}`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()).toEqual(context({ scope_id: OTHER_SCOPE_ID }))
    expect(readSharedContext()).toEqual(context())

    foreground.hasFocus.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => {
      expect(readSharedContext()).toEqual(context({ scope_id: OTHER_SCOPE_ID }))
    })
  })

  it('requires visibility and focus together for event-driven publication', async () => {
    const foreground = setForegroundState({ visibility: 'visible', focused: false })
    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })
    window.sessionStorage.setItem(
      TAB_CONTEXT_STORAGE_KEY,
      JSON.stringify(context({ scope_id: OTHER_SCOPE_ID }))
    )
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))

    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(readSharedContext()).toEqual(context())

    foreground.visibilityState.mockReturnValue('hidden')
    foreground.hasFocus.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    expect(readSharedContext()).toEqual(context())

    foreground.visibilityState.mockReturnValue('visible')
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => {
      expect(readSharedContext()).toEqual(context({ scope_id: OTHER_SCOPE_ID }))
    })
  })

  it('adopts one complete shared record for a cold bookmark or typed URL', async () => {
    const inherited = context({
      issuer: OTHER_ISSUER,
      scope_id: OTHER_SCOPE_ID,
      scope_name: 'Other Term',
    })
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(inherited))
    window.history.replaceState(null, '', '/bookmarked-activity?authored=yes#section')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse([OTHER_ISSUER]))
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()).toEqual(inherited)
    expect(redirected.navigation.url.origin).toBe(OTHER_ISSUER)
    expect(redirected.navigation.url.searchParams.get('scope_id')).toBe(OTHER_SCOPE_ID)
    expect(readOAuthSession()?.return_location).toEqual({
      search: '?authored=yes',
      hash: '#section',
    })
  })

  it('keeps an established tab stable across reload and OAuth while shared context differs', async () => {
    const established = context({ scope_id: OTHER_SCOPE_ID, scope_name: 'Other Term' })
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, JSON.stringify(established))
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )
    expect(readOAuthSession()?.context).toEqual(established)

    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    const saved = readOAuthSession()
    expect(saved).not.toBeNull()
    window.history.replaceState(null, '', `/activity?state=${saved?.state}&code=auth-code`)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_id: OTHER_SCOPE_ID, scope_name: 'Other Term' }))
    )

    const result = await authenticate(undefined)

    expect(result).toMatchObject({ status: 'authenticated', scope_id: OTHER_SCOPE_ID })
    expect(readTabContext()).toEqual(established)
    expect(readSharedContext()).toEqual(established)
  })

  it('ignores a malformed shared record without corrupting an established background tab', async () => {
    setForegroundState({ visibility: 'visible', focused: false })
    const established = context({ scope_id: OTHER_SCOPE_ID })
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, JSON.stringify(established))
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, '{')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()).toEqual(established)
    expect(window.localStorage.getItem(SHARED_CONTEXT_STORAGE_KEY)).toBe('{')
  })

  it('does not let a background OAuth error clear the foreground shared record', async () => {
    setForegroundState({ visibility: 'visible', focused: false })
    const background = context({ scope_id: OTHER_SCOPE_ID })
    window.sessionStorage.setItem(TAB_CONTEXT_STORAGE_KEY, JSON.stringify(background))
    window.sessionStorage.setItem(
      OAUTH_SESSION_STORAGE_KEY,
      JSON.stringify(oauthSession({ context: background }))
    )
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
    window.history.replaceState(null, '', '/activity?state=oauth-state&error=access_denied')

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'expired' })

    expect(readTabContext()).toEqual(background)
    expect(readOAuthSession()).toBeNull()
    expect(readSharedContext()).toEqual(context())
  })

  it('compare-and-delete preserves a newer shared record', async () => {
    const invalid = context({ issuer: 'https://removed-gradebook.test', scope_id: OTHER_SCOPE_ID })
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(invalid))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(context()))
        return registryResponse([])
      })
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'invalid_issuer',
    })

    expect(readTabContext()).toBeNull()
    expect(readSharedContext()).toEqual(context())
  })

  it('lets a foreground owner compare-and-delete its definitively invalid shared record', async () => {
    const invalid = context({ issuer: 'https://removed-gradebook.test' })
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(invalid))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse([]))
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'invalid_issuer',
    })

    expect(readTabContext()).toBeNull()
    expect(readSharedContext()).toBeNull()
  })

  it('safely ignores and removes malformed shared context only when foregrounded', async () => {
    window.localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, '{')

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'none' })

    expect(window.localStorage.getItem(SHARED_CONTEXT_STORAGE_KEY)).toBeNull()
  })

  it('continues OAuth when shared storage is unavailable and fails safely when tab storage is unavailable', async () => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()
    const localStorage = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    localStorage.mockRestore()
    window.sessionStorage.clear()
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}`
    )
    const sessionStorage = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'storage_unavailable',
    })

    sessionStorage.mockRestore()
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

  it('redacts OAuth credentials and learner identity from diagnostics', async () => {
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(oauthSession()))
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_name: 'Autumn 2026' }))
    )
    const log = vi.fn(async () => {})

    await authenticate({ log })

    const diagnostics = JSON.stringify(log.mock.calls)
    expect(diagnostics).toContain('[redacted]')
    expect(diagnostics).not.toContain('auth-code')
    expect(diagnostics).not.toContain('code-verifier')
    expect(diagnostics).not.toContain('access-token')
    expect(diagnostics).not.toContain('opaque-user')
    expect(diagnostics).not.toContain('Test User')
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

  it('normalizes an equivalent token-response scope before comparing identity', async () => {
    window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(oauthSession()))
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_id: SCOPE_ID.toUpperCase() }))
    )

    const result = await authenticate(undefined)

    expect(result).toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
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
