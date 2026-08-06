import {
  clearOAuthSession,
  clearTabContext,
  createActivityContext,
  DEFAULT_SCOPE_ID,
  deleteSharedContextIfForeground,
  installForegroundContextPublication,
  publishTabContextIfForeground,
  readOAuthSession,
  readSharedContextSnapshot,
  readTabContext,
  removeLegacyIssuerContext,
  type StoredActivityContext,
  type StoredOAuthSession,
  type StoredReturnLocation,
  sameActivityContextIdentity,
  writeOAuthSession,
  writeTabContext,
} from './activity-context.js'
import type { Logger } from './logger.js'
import type { User } from './types.js'

type AuthResult =
  | { status: 'none' }
  | {
      status: 'authenticated'
      baseUrl: string
      user: User
      token: string
      scope_id: string
      scope_name: string | null
    }
  | { status: 'expired' }
  | { status: 'failed'; baseUrl?: string | undefined; error: string }

type AuthOptions = {
  navigate?: (url: URL) => void
}

export const authenticate = async (
  logger: Logger | undefined,
  options: AuthOptions = {}
): Promise<AuthResult> => {
  const params = getQueryParams()
  installForegroundContextPublication(logger)
  // Remove the pre-scope issuer-only record on every path. It is never used as
  // a compatibility source for the versioned context.
  removeLegacyIssuerContext()

  const { state, code, error, error_description, error_uri } = params

  // If we received a Modulus server url in the query parameters, check that
  // it's legitimate and then attempt to request an auth code from that server.
  if (params.issuer != null) {
    await logger?.log('Received Modulus server url in query parameters:', params.issuer)

    const context = createActivityContext(params.issuer, params.scope_id ?? DEFAULT_SCOPE_ID)
    if (context == null) {
      await logger?.log('Invalid activity context in query parameters')
      return {
        status: 'failed',
        error:
          createActivityContext(params.issuer, DEFAULT_SCOPE_ID) == null
            ? 'invalid_issuer'
            : 'invalid_scope',
      }
    }

    const validationResult = await validateIssuer(
      context.issuer,
      'https://modulus-learning.org/api/registry',
      logger
    )

    if (!validationResult.ok) {
      // The issuer is not recognized (or the attempt to validate it failed) --
      // report an error and make no further attempt at auth.
      await logger?.log('Issuer validation failed:', validationResult.error)
      return {
        status: 'failed',
        error: validationResult.error,
      }
    }

    const previousTabContext = readTabContext()
    const previousSharedContext = readSharedContextSnapshot()?.context ?? null
    const previousContext = previousTabContext ?? previousSharedContext
    if (previousContext != null && !sameActivityContextIdentity(previousContext, context)) {
      await logger?.log('Fresh launch changed the activity context', {
        history: previousTabContext == null ? 'shared' : 'tab',
        previous_scope_id: previousContext.scope_id,
        scope_id: context.scope_id,
        issuer_changed: previousContext.issuer !== context.issuer,
      })
    }

    // Commit the complete pair before OAuth starts. Reloads and navigation in
    // this tab now use one atomic issuer/scope identity.
    if (!writeTabContext(context)) {
      await logger?.log('Unable to commit fresh activity context to tab storage')
      return { status: 'failed', error: 'storage_unavailable' }
    }
    await publishTabContextIfForeground(logger)

    // Request an auth code.  This will redirect the browser to the Modulus
    // server's authorization endpoint, so this call will never return.
    return await requestAuthCode(context, logger, options)
  }

  // OAuth response handling uses only the exact pre-redirect session snapshot.
  // Foreground publication cannot affect which context the exchange uses.
  if (state != null || code != null || error != null) {
    await logger?.log('Received OAuth response')
    await publishTabContextIfForeground(logger)
    return await handleAuthCodeResponse(state, code, error, error_description, error_uri, logger)
  }

  // Window.sessionStorage contains stored state suggesting this browser session
  // (tab) was already redirected to a Modulus server for authentication, but
  // was never redirected back.  This probably means the target server is down,
  // or there was some other (hopefully transient) issue that prevented the
  // redirect back.  In this case, report an error and make no further attempt
  // at auth.
  const authRequestInProgress = readOAuthSession() != null
  if (authRequestInProgress) {
    await logger?.log('Auth request in progress, but no auth response received yet')
    return {
      status: 'failed',
      error: 'missing_redirect',
    }
  }

  const storedContext = readTabContext()
  if (storedContext != null) {
    await logger?.log('Found stored activity context in sessionStorage:', {
      issuer: storedContext.issuer,
      scope_id: storedContext.scope_id,
    })

    const validationResult = await validateIssuer(
      storedContext.issuer,
      'https://modulus-learning.org/api/registry',
      logger
    )

    if (!validationResult.ok) {
      // The issuer is not recognized (or the attempt to validate it failed) --
      // report an error and make no further attempt at auth.
      await logger?.log('Issuer validation failed:', validationResult.error)
      if (validationResult.error === 'invalid_issuer') {
        clearTabContext()
        const shared = readSharedContextSnapshot()
        if (shared?.context != null && sameActivityContextIdentity(storedContext, shared.context)) {
          await deleteSharedContextIfForeground(shared, logger)
        }
      }
      return {
        status: 'failed',
        error: validationResult.error,
      }
    }

    await publishTabContextIfForeground(logger)
    return await requestAuthCode(storedContext, logger, options)
  }

  const shared = readSharedContextSnapshot()
  if (shared != null) {
    if (shared.context == null) {
      await logger?.log('Ignored malformed shared activity context')
      await deleteSharedContextIfForeground(shared, logger)
      return { status: 'none' }
    }

    if (!writeTabContext(shared.context)) {
      await logger?.log('Unable to inherit shared activity context into tab storage')
      return { status: 'failed', error: 'storage_unavailable' }
    }
    await logger?.log('Cold tab inherited the foreground activity context', {
      scope_id: shared.context.scope_id,
    })

    const validationResult = await validateIssuer(
      shared.context.issuer,
      'https://modulus-learning.org/api/registry',
      logger
    )
    if (!validationResult.ok) {
      await logger?.log('Inherited issuer validation failed:', validationResult.error)
      if (validationResult.error === 'invalid_issuer') {
        clearTabContext()
        await deleteSharedContextIfForeground(shared, logger)
      }
      return {
        status: 'failed',
        error: validationResult.error,
      }
    }

    await publishTabContextIfForeground(logger)
    return await requestAuthCode(shared.context, logger, options)
  }

  return {
    status: 'none',
  }
}

const validateIssuer = async (
  issuer: string,
  registryUrl: string,
  logger: Logger | undefined
): Promise<{ ok: true } | { ok: false; error: string }> => {
  await logger?.log('Looking for issuer in Modulus server registry', { issuer, registryUrl })
  // TODO: Should this retry on network errors?
  try {
    const response = await fetch(registryUrl)
    if (!response.ok) {
      await logger?.log('Failed to fetch Modulus server registry', {
        registryUrl,
        status: response.status,
      })
      return {
        ok: false,
        error: 'issuer_validation_failed',
      }
    }

    const { installations } = await response.json()
    if (installations.some((inst: any) => inst['site-url'] === issuer)) {
      await logger?.log('Issuer found in Modulus server registry')
      return { ok: true }
    }
    await logger?.log('Issuer not found in Modulus server registry', { issuer, registryUrl })
    return { ok: false, error: 'invalid_issuer' }
  } catch (err) {
    await logger?.log('Failed to fetch Modulus server registry', { registryUrl, error: `${err}` })
    return { ok: false, error: 'issuer_validation_failed' }
  }
}

export const createAuthorizationRequestParams = ({
  redirect_uri,
  state,
  code_challenge,
  scope_id,
}: {
  redirect_uri: string
  state: string
  code_challenge: string
  scope_id: string | null | undefined
}): Record<string, string> => {
  const requestParams: Record<string, string> = {
    response_type: 'code',
    client_id: redirect_uri,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method: 'S256',
  }

  if (scope_id != null) {
    requestParams.scope_id = scope_id
  }

  return requestParams
}

const requestAuthCode = async (
  context: StoredActivityContext,
  logger: Logger | undefined,
  options: AuthOptions
): Promise<AuthResult> => {
  await logger?.log('Preparing authorization request')

  const code_verifier = createPKCECodeVerifier()
  const code_challenge = await createPKCECodeChallenge(code_verifier)
  const state = createOAuthState()

  const redirect_uri = getOAuthRedirectUri()

  // TODO: This request conforms to RFC 7636, but seems a bit redundant in our
  // case.  For example, we only ever support response_type = 'code' and
  // code_challenge_method = 'S256', and we always set the client_id equal to
  // the redirect_uri, so do we really need to transmit those?
  const requestParams = createAuthorizationRequestParams({
    redirect_uri,
    state,
    code_challenge,
    scope_id: context.scope_id,
  })

  await logger?.log('Auth request parameters:', JSON.stringify(requestParams, null, 2))

  const requestUrl = new URL('/routes/agent/authorize', context.issuer)
  requestUrl.search = new URLSearchParams(requestParams).toString()

  await logger?.log('Redirecting to', requestUrl.toString())

  const oauthSession: StoredOAuthSession = {
    version: 1,
    state,
    code_verifier,
    context,
    return_location: {
      search: window.location.search,
      hash: window.location.hash,
    },
  }
  if (!writeOAuthSession(oauthSession)) {
    await logger?.log('Unable to save OAuth session in tab storage')
    return { status: 'failed', error: 'storage_unavailable' }
  }

  // NOTE: This redirects to requestUrl, which immediately unloads the current
  // page and discontinues all further javascript execution.  In other words,
  // this function never returns.
  if (options.navigate != null) {
    options.navigate(requestUrl)
  } else {
    window.location.assign(requestUrl)
  }

  // Satisfy TypeScript that this function never returns
  return new Promise(() => {})
}

const handleAuthCodeResponse = async (
  state: string | null,
  code: string | null,
  error: string | null,
  error_description: string | null,
  error_uri: string | null,
  logger: Logger | undefined
): Promise<AuthResult> => {
  const oauthSession = readOAuthSession()
  clearOAuthSession()
  if (oauthSession != null) {
    restoreReturnLocation(oauthSession.return_location)
  }

  if (state == null) {
    await logger?.log('OAuth state not supplied')
    return {
      status: 'failed',
      error: 'malformed_oauth_response',
    }
  }

  // If the state in the response doesn't match the stored state, report an
  // error and make no further attempt at auth.
  if (oauthSession == null || state !== oauthSession.state) {
    await logger?.log('OAuth state is invalid')
    return {
      status: 'failed',
      error: 'oauth_state_mismatch',
    }
  }

  // If we received an OAuth error response, report the error and make no
  // further attempt at auth.
  if (error != null) {
    await logger?.log('OAuth error response from gradebook:', {
      error,
      error_description,
      error_uri,
      issuer: oauthSession?.context.issuer,
      redirect_uri: getOAuthRedirectUri(),
    })

    // `access_denied` means the gradebook refused the authorization request --
    // almost always because the learner's Modulus session cookie is gone.  This
    // is the common learner session-expiry path, so surface it as a distinct
    // "session has ended" state (rather than a generic failure) so the widget
    // can prompt a re-launch from the LMS.
    if (error === 'access_denied') {
      return { status: 'expired' }
    }

    return {
      status: 'failed',
      error: OAUTH_ERRORS.includes(error) ? error : 'malformed_response',
    }
  }

  // If we're missing the authorization code, report an error and make no
  // further attempt at auth.
  if (code == null) {
    await logger?.log('OAuth code not supplied')
    return {
      status: 'failed',
      error: 'malformed_oauth_response',
    }
  }

  const redirect_uri = getOAuthRedirectUri()

  const requestParams = {
    grant_type: 'authorization_code',
    code,
    client_id: redirect_uri,
    redirect_uri,
    code_verifier: oauthSession.code_verifier,
  }

  await logger?.log(
    'Token request parameters:',
    JSON.stringify({ ...requestParams, code_verifier: '[redacted]' })
  )

  const requestUrl = new URL('/routes/agent/token', oauthSession.context.issuer)
  await logger?.log('Posting token request to', requestUrl.toString())
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(requestParams),
    })

    if (response.ok) {
      const { api_base_url, access_token, user, scope_id, scope_name } = await response.json()
      await logger?.log(
        'Received token response:',
        JSON.stringify({ access_token: '[redacted]', api_base_url, user, scope_id, scope_name })
      )
      const refreshedContext = createActivityContext(
        oauthSession.context.issuer,
        scope_id,
        scope_name
      )
      if (refreshedContext == null || refreshedContext.scope_id !== oauthSession.context.scope_id) {
        await logger?.log('Token response scope did not match requested activity context', {
          expected_scope_id: oauthSession.context.scope_id,
          received_scope_id: scope_id,
        })
        return {
          status: 'failed',
          error: 'token_scope_mismatch',
        }
      }

      if (!writeTabContext(refreshedContext)) {
        await logger?.log('Unable to refresh activity context in tab storage')
      }
      return {
        status: 'authenticated',
        baseUrl: api_base_url,
        token: access_token,
        user,
        scope_id: oauthSession.context.scope_id,
        scope_name: refreshedContext?.scope_name ?? null,
      }
    }
    const err = await response.text()
    await logger?.log(`Token request failed with status ${response.status}:`, err)
    return {
      status: 'failed',
      error: 'token_request_failed',
    }
  } catch (err) {
    await logger?.log('Error submitting token request:', `${err}`)
    return {
      status: 'failed',
      error: 'token_request_failed',
    }
  }
}

const OAUTH_ERRORS = [
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
]

const MODULUS_BASE_URL_PARAM = 'modulus'
const SCOPE_ID_PARAM = 'scope_id'
const OAUTH_CODE_PARAM = 'code'
const OAUTH_STATE_PARAM = 'state'
const OAUTH_ERROR_PARAM = 'error'
const OAUTH_ERROR_DESCRIPTION_PARAM = 'error_description'
const OAUTH_ERROR_URI_PARAM = 'error_uri'

export const getQueryParams = () => {
  const query = new URLSearchParams(window.location.search)
  const state = query.get(OAUTH_STATE_PARAM)
  const code = query.get(OAUTH_CODE_PARAM)
  const error = query.get(OAUTH_ERROR_PARAM)
  const error_description = query.get(OAUTH_ERROR_DESCRIPTION_PARAM)
  const error_uri = query.get(OAUTH_ERROR_URI_PARAM)
  const issuer = query.get(MODULUS_BASE_URL_PARAM)
  const scope_id = query.get(SCOPE_ID_PARAM)

  query.delete(OAUTH_STATE_PARAM)
  query.delete(OAUTH_CODE_PARAM)
  query.delete(OAUTH_ERROR_PARAM)
  query.delete(OAUTH_ERROR_DESCRIPTION_PARAM)
  query.delete(OAUTH_ERROR_URI_PARAM)
  query.delete(MODULUS_BASE_URL_PARAM)
  query.delete(SCOPE_ID_PARAM)

  const newUrl = new URL(window.location.href)
  newUrl.search = query.toString()
  window.history.replaceState(null, '', newUrl)

  return { state, code, error, error_description, error_uri, issuer, scope_id }
}

const restoreReturnLocation = ({ search, hash }: StoredReturnLocation): void => {
  const returnUrl = new URL(window.location.href)
  returnUrl.search = search
  returnUrl.hash = hash
  window.history.replaceState(null, '', returnUrl)
}

// Warning: this method only works with relatively short byte arrays, say less
// than a few thousand bytes.
const base64UrlEncode = (bytes: Uint8Array): string => {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const createPKCECodeVerifier = () => {
  const randomBytes = window.crypto.getRandomValues(new Uint8Array(48))
  return base64UrlEncode(randomBytes)
}

const createPKCECodeChallenge = async (codeVerifier: string) => {
  const codeVerifierBytes = new TextEncoder().encode(codeVerifier)
  const codeChallengBuffer = await window.crypto.subtle.digest('SHA-256', codeVerifierBytes)
  const codeChallengeBytes = new Uint8Array(codeChallengBuffer)
  return base64UrlEncode(codeChallengeBytes)
}

const createOAuthState = () => {
  const randomBytes = window.crypto.getRandomValues(new Uint8Array(48))
  return base64UrlEncode(randomBytes)
}

const getOAuthRedirectUri = () => {
  const location = new URL(window.location.href)
  location.search = ''
  location.hash = ''
  return location.toString()
}
