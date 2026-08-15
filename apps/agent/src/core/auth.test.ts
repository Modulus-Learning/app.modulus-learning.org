import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ACTIVITY_CONTEXT_STORAGE_KEY,
  DEFAULT_SCOPE_ID,
  OAUTH_SESSION_STORAGE_KEY,
  readLocalContext,
  readOAuthSession,
  readTabContext,
  type StoredActivityContext,
  type StoredOAuthSession,
} from './activity-context.js'
import {
  authenticate,
  createAuthorizationRequestParams,
  getQueryParams,
  resetAuthenticationStateForTesting,
} from './auth.js'

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

const storeTabContext = (value: StoredActivityContext): void => {
  window.sessionStorage.setItem(ACTIVITY_CONTEXT_STORAGE_KEY, JSON.stringify(value))
}

const storeLocalContext = (value: StoredActivityContext): void => {
  window.localStorage.setItem(ACTIVITY_CONTEXT_STORAGE_KEY, JSON.stringify(value))
}

const storeOAuthSession = (value: StoredOAuthSession): void => {
  window.sessionStorage.setItem(OAUTH_SESSION_STORAGE_KEY, JSON.stringify(value))
}

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
  resetAuthenticationStateForTesting()
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

describe('activity context resolution', () => {
  it('commits a fresh launch to the tab before OAuth without changing the local default', async () => {
    const previousLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(previousLocal)
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
    expect(readLocalContext()).toEqual(previousLocal)
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

  it('single-flights concurrent initialization so stale tab context cannot race a fresh launch', async () => {
    storeTabContext(context({ scope_id: OTHER_SCOPE_ID }))
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}`
    )
    const fetch = vi.fn(async () => registryResponse())
    vi.stubGlobal('fetch', fetch)
    const navigations: URL[] = []
    const navigate = (url: URL) => {
      navigations.push(url)
      throw new Navigation(url)
    }

    const first = authenticate(undefined, { navigate })
    const second = authenticate(undefined, { navigate })
    const samePromise = first === second
    const settled = await Promise.allSettled([first, second])

    expect(settled.every(({ status }) => status === 'rejected')).toBe(true)
    expect(navigations.map((url) => url.searchParams.get('scope_id'))).toEqual([SCOPE_ID])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(samePromise).toBe(true)
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
    expect(readLocalContext()).toBeNull()
    expect(redirected.navigation.url.searchParams.get('scope_id')).toBe(DEFAULT_SCOPE_ID)
  })

  it('compares tab history before local history for an explicit launch switch', async () => {
    storeTabContext(context())
    storeLocalContext(context({ scope_id: OTHER_SCOPE_ID }))
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
  ])(
    'fails safely for an %s in a fresh launch without clearing stored context',
    async (_label, issuer, scopeId, expectedError) => {
      const established = context({ scope_id: OTHER_SCOPE_ID })
      storeTabContext(established)
      storeLocalContext(established)
      window.history.replaceState(
        null,
        '',
        `/activity?modulus=${encodeURIComponent(issuer)}&scope_id=${scopeId}&authored=yes#part`
      )

      await expect(authenticate(undefined)).resolves.toEqual({
        status: 'failed',
        error: expectedError,
      })

      expect(readTabContext()).toEqual(established)
      expect(readLocalContext()).toEqual(established)
      expect(window.location.search).toBe('?authored=yes')
      expect(window.location.hash).toBe('#part')
    }
  )

  it('uses an established tab context before a different local default', async () => {
    const established = context({ scope_id: OTHER_SCOPE_ID, scope_name: 'Other Term' })
    storeTabContext(established)
    storeLocalContext(context())
    window.history.replaceState(null, '', '/next-page?authored=yes#part')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readOAuthSession()?.context).toEqual(established)
    expect(readOAuthSession()?.return_location).toEqual({
      search: '?authored=yes',
      hash: '#part',
    })
  })

  it('keeps an interrupted OAuth transaction sticky instead of falling through to stored context', async () => {
    const pending = oauthSession()
    storeOAuthSession(pending)
    storeTabContext(context({ scope_id: OTHER_SCOPE_ID }))
    storeLocalContext(context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID }))
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'missing_redirect',
    })

    expect(readOAuthSession()).toEqual(pending)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('selects a local default for OAuth without establishing the tab first', async () => {
    const local = context({
      issuer: OTHER_ISSUER,
      scope_id: OTHER_SCOPE_ID,
      scope_name: 'Other Term',
    })
    storeLocalContext(local)
    window.history.replaceState(null, '', '/bookmarked-activity?authored=yes#section')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse([OTHER_ISSUER]))
    )
    const redirected = captureNavigation()

    await expect(authenticate(undefined, { navigate: redirected.navigate })).rejects.toBeInstanceOf(
      Navigation
    )

    expect(readTabContext()).toBeNull()
    expect(readOAuthSession()?.context).toEqual(local)
    expect(redirected.navigation.url.origin).toBe(OTHER_ISSUER)
    expect(redirected.navigation.url.searchParams.get('scope_id')).toBe(OTHER_SCOPE_ID)
  })

  it.each([
    ['malformed JSON', '{'],
    ['invalid issuer', JSON.stringify({ version: 1, issuer: 'not a url', scope_id: SCOPE_ID })],
    ['invalid UUID', JSON.stringify({ version: 1, issuer: ISSUER, scope_id: 'not-a-uuid' })],
    ['unsupported version', JSON.stringify({ version: 2, issuer: ISSUER, scope_id: SCOPE_ID })],
  ])('clears a %s record without changing the other context store', (_label, serialized) => {
    const validLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    window.sessionStorage.setItem(ACTIVITY_CONTEXT_STORAGE_KEY, serialized)
    storeLocalContext(validLocal)

    expect(readTabContext()).toBeNull()
    expect(window.sessionStorage.getItem(ACTIVITY_CONTEXT_STORAGE_KEY)).toBeNull()
    expect(readLocalContext()).toEqual(validLocal)

    const validTab = context()
    storeTabContext(validTab)
    window.localStorage.setItem(ACTIVITY_CONTEXT_STORAGE_KEY, serialized)

    expect(readLocalContext()).toBeNull()
    expect(window.localStorage.getItem(ACTIVITY_CONTEXT_STORAGE_KEY)).toBeNull()
    expect(readTabContext()).toEqual(validTab)
  })

  it('removes every current context naming a definitively invalid stored issuer', async () => {
    const invalidIssuer = 'https://removed-gradebook.test'
    storeTabContext(context({ issuer: invalidIssuer }))
    storeLocalContext(context({ issuer: invalidIssuer, scope_id: OTHER_SCOPE_ID }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse([]))
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'invalid_issuer',
    })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toBeNull()
  })

  it('preserves a local context changed while an invalid stored issuer is being checked', async () => {
    const invalidIssuer = 'https://removed-gradebook.test'
    storeTabContext(context({ issuer: invalidIssuer }))
    storeLocalContext(context({ issuer: invalidIssuer, scope_id: OTHER_SCOPE_ID }))
    const replacement = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        storeLocalContext(replacement)
        return registryResponse([])
      })
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'invalid_issuer',
    })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(replacement)
  })

  it('continues a fresh launch when local storage is unavailable', async () => {
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
    expect(readTabContext()).toEqual(context())
  })

  it('continues a tab-backed OAuth flow when local storage is unavailable', async () => {
    const established = context({ scope_id: OTHER_SCOPE_ID })
    storeTabContext(established)
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
    expect(readOAuthSession()?.context).toEqual(established)
    expect(redirected.navigation.url.searchParams.get('scope_id')).toBe(OTHER_SCOPE_ID)
  })

  it('fails safely when session storage cannot commit a fresh tab context', async () => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=${encodeURIComponent(ISSUER)}&scope_id=${SCOPE_ID}`
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse())
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

  it('does not navigate from a local default when the OAuth transaction cannot be preserved', async () => {
    const selected = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(selected)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => registryResponse([OTHER_ISSUER]))
    )
    const navigate = vi.fn()
    const sessionStorage = window.sessionStorage
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage && key === OAUTH_SESSION_STORAGE_KEY) {
        throw new DOMException('blocked', 'SecurityError')
      }
      originalSetItem.call(this, key, value)
    })

    await expect(authenticate(undefined, { navigate })).resolves.toEqual({
      status: 'failed',
      error: 'storage_unavailable',
    })

    expect(navigate).not.toHaveBeenCalled()
    expect(readOAuthSession()).toBeNull()
    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(selected)
  })
})

describe('OAuth response restoration and persistence', () => {
  it('uses only the saved context, restores the authored location, and commits both stores on success', async () => {
    const saved = oauthSession()
    storeOAuthSession(saved)
    storeTabContext(context({ scope_id: OTHER_SCOPE_ID, scope_name: 'Other Scope' }))
    storeLocalContext(context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID }))
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
        storeLocalContext(context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID }))
        return tokenResponse({ scope_name: 'Autumn 2026' })
      })
    )

    const result = await authenticate(undefined)

    const authenticated = context({ scope_name: 'Autumn 2026' })
    expect(result).toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
      scope_name: 'Autumn 2026',
    })
    expect(window.location.search).toBe('?tag=one&tag=two&authored=yes')
    expect(window.location.hash).toBe('#section')
    expect(readOAuthSession()).toBeNull()
    expect(readTabContext()).toEqual(authenticated)
    expect(readLocalContext()).toEqual(authenticated)
    expect(tokenRequestUrl).toBe('https://gradebook.test/routes/agent/token')

    const body = new URLSearchParams(String(tokenRequest?.body))
    const clientId = new URL(body.get('client_id') ?? '')
    const redirectUri = new URL(body.get('redirect_uri') ?? '')
    expect(clientId.search).toBe('')
    expect(clientId.hash).toBe('')
    expect(redirectUri.search).toBe('')
    expect(redirectUri.hash).toBe('')
  })

  it('single-flights concurrent OAuth callbacks through one token exchange', async () => {
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    const fetch = vi.fn(async () => tokenResponse({ scope_name: 'Autumn 2026' }))
    vi.stubGlobal('fetch', fetch)

    const first = authenticate(undefined)
    const second = authenticate(undefined)
    const samePromise = first === second
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(samePromise).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
      scope_name: 'Autumn 2026',
    })
  })

  it('lets separate tabs keep their contexts while the last successful callback becomes local', async () => {
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=first-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_name: 'First Term' }))
    )

    await expect(authenticate(undefined)).resolves.toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
    })
    const firstTabRecord = window.sessionStorage.getItem(ACTIVITY_CONTEXT_STORAGE_KEY)
    expect(firstTabRecord).not.toBeNull()
    expect(readTabContext()).toEqual(context({ scope_name: 'First Term' }))
    expect(readLocalContext()).toEqual(context({ scope_name: 'First Term' }))

    // A separate tab has independent sessionStorage but shares localStorage.
    window.sessionStorage.clear()
    const second = context({
      issuer: OTHER_ISSUER,
      scope_id: OTHER_SCOPE_ID,
      scope_name: 'Second Term',
    })
    storeOAuthSession(oauthSession({ state: 'second-state', context: second }))
    window.history.replaceState(null, '', '/activity?state=second-state&code=second-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        tokenResponse({ scope_id: OTHER_SCOPE_ID, scope_name: 'Second Term Refreshed' })
      )
    )

    await expect(authenticate(undefined)).resolves.toMatchObject({
      status: 'authenticated',
      scope_id: OTHER_SCOPE_ID,
    })
    expect(readLocalContext()).toEqual({
      ...second,
      scope_name: 'Second Term Refreshed',
    })
    expect(readTabContext()).toEqual({
      ...second,
      scope_name: 'Second Term Refreshed',
    })

    window.sessionStorage.clear()
    window.sessionStorage.setItem(ACTIVITY_CONTEXT_STORAGE_KEY, firstTabRecord ?? '')
    expect(readTabContext()).toEqual(context({ scope_name: 'First Term' }))
    expect(readLocalContext()).toEqual({
      ...second,
      scope_name: 'Second Term Refreshed',
    })
  })

  it('does not establish a locally selected context when OAuth returns an error', async () => {
    const selected = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(selected)
    storeOAuthSession(oauthSession({ context: selected }))
    window.history.replaceState(null, '', '/activity?state=oauth-state&error=access_denied')

    await expect(authenticate(undefined)).resolves.toEqual({ status: 'expired' })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(selected)
    expect(readOAuthSession()).toBeNull()
  })

  it('does not commit context when OAuth state is invalid', async () => {
    const previousLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(previousLocal)
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=wrong-state&code=auth-code')

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'oauth_state_mismatch',
    })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(previousLocal)
  })

  it('does not commit context when a matching OAuth response omits the code', async () => {
    const previousLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(previousLocal)
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state')

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'malformed_oauth_response',
    })

    expect(readOAuthSession()).toBeNull()
    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(previousLocal)
  })

  it('does not commit context when the token request fails', async () => {
    const previousLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(previousLocal)
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 401 }))
    )

    await expect(authenticate(undefined)).resolves.toEqual({
      status: 'failed',
      error: 'token_request_failed',
    })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(previousLocal)
  })

  it('redacts OAuth credentials and learner identity from diagnostics', async () => {
    storeOAuthSession(oauthSession())
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

  it('allows scope_name to be absent without changing scope identity', async () => {
    storeOAuthSession(oauthSession({ context: context({ scope_name: 'Old Name' }) }))
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
    expect(readLocalContext()).toEqual(context())
  })

  it('normalizes an equivalent token-response scope before comparing identity', async () => {
    storeOAuthSession(oauthSession())
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
    expect(readLocalContext()).toEqual(context())
  })

  it('rejects a token response that names a different scope without committing it', async () => {
    const previousLocal = context({ issuer: OTHER_ISSUER, scope_id: OTHER_SCOPE_ID })
    storeLocalContext(previousLocal)
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ scope_id: OTHER_SCOPE_ID }))
    )

    const result = await authenticate(undefined)

    expect(result).toEqual({ status: 'failed', error: 'token_scope_mismatch' })
    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(previousLocal)
  })

  it('returns authenticated when the local default cannot be cached', async () => {
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse())
    )
    const log = vi.fn(async () => {})
    const localStorage = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    await expect(authenticate({ log })).resolves.toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
    })

    localStorage.mockRestore()
    expect(readTabContext()).toEqual(context())
    expect(log).toHaveBeenCalledWith(
      'Unable to save authenticated activity context as the local default'
    )
  })

  it('writes the local default even when the authenticated tab context cannot be cached', async () => {
    storeOAuthSession(oauthSession())
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse())
    )
    const log = vi.fn(async () => {})
    const sessionStorage = window.sessionStorage
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage && key === ACTIVITY_CONTEXT_STORAGE_KEY) {
        throw new DOMException('blocked', 'SecurityError')
      }
      originalSetItem.call(this, key, value)
    })

    await expect(authenticate({ log })).resolves.toMatchObject({
      status: 'authenticated',
      scope_id: SCOPE_ID,
    })

    expect(readTabContext()).toBeNull()
    expect(readLocalContext()).toEqual(context())
    expect(log).toHaveBeenCalledWith('Unable to refresh activity context in tab storage')
  })

  it('clears a malformed OAuth session and fails without throwing', async () => {
    storeOAuthSession({ ...oauthSession(), version: 2 as 1 })
    window.history.replaceState(null, '', '/activity?state=oauth-state&code=auth-code')

    const result = await authenticate(undefined)

    expect(result).toEqual({ status: 'failed', error: 'oauth_state_mismatch' })
    expect(readOAuthSession()).toBeNull()
    expect(window.location.search).toBe('')
  })
})
