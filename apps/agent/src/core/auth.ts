import type { Logger } from './logger.js'
import type { User } from './types.js'

type AuthResult =
  | { status: 'none' }
  | { status: 'authenticated'; baseUrl: string; user: User; token: string }
  | { status: 'failed'; baseUrl?: string | undefined; error: string }

export const authenticate = async (logger: Logger | undefined): Promise<AuthResult> => {
  const params = getQueryParams()

  const { state, code, error, error_description, error_uri } = params

  // If we received any OAuth response parameters, assume we've been redirected
  // back from an authorization request, and handle the response accordingly.
  if (state != null || code != null || error != null) {
    await logger?.log('Received OAuth response')
    return await handleAuthCodeResponse(state, code, error, error_description, error_uri, logger)
  }

  // If we received a Modulus server url in the query parameters, check that
  // it's legitimate and then attempt to request an auth code from that server.
  if (params.issuer != null) {
    await logger?.log('Received Modulus server url in query parameters:', params.issuer)

    let issuer: string
    try {
      issuer = decodeURIComponent(params.issuer)
    } catch (_err) {
      // The url was improperly encoded -- report an error and make no further
      // attempt at auth.
      await logger?.log('Invalid issuer in query parameters')
      return {
        status: 'failed',
        error: 'invalid_issuer',
      }
    }

    const validationResult = await validateIssuer(
      issuer,
      'https://modulus-learning.org/routes/registry',
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

    // Request an auth code.  This will redirect the browser to the Modulus
    // server's authorization endpoint, so this call will never return.
    return await requestAuthCode(issuer, logger)
  }

  // Window.sessionStorage contains stored state suggesting this browser session
  // (tab) was already redirected to a Modulus server for authentication, but
  // was never redirected back.  This probably means the target server is down,
  // or there was some other (hopefully transient) issue that prevented the
  // redirect back.  In this case, report an error and make no further attempt
  // at auth.
  const authRequestInProgress = window.sessionStorage.getItem('oauth_state') != null
  if (authRequestInProgress) {
    await logger?.log('Auth request in progress, but no auth response received yet')
    return {
      status: 'failed',
      error: 'missing_redirect',
    }
  }

  // Check if there's a stored Modulus server url in localStorage
  const storedIssuer = window.localStorage.getItem(MODULUS_BASE_URL_STORAGE_KEY)
  if (storedIssuer != null) {
    await logger?.log('Found stored issuer in localStorage:', storedIssuer)

    const validationResult = await validateIssuer(
      storedIssuer,
      'https://modulus-learning.org/routes/registry',
      logger
    )

    if (!validationResult.ok) {
      // The issuer is not recognized (or the attempt to validate it failed) --
      // report an error and make no further attempt at auth.
      await logger?.log('Issuer validation failed:', validationResult.error)
      // If the registry definitively rejected the stored issuer, drop the
      // cached value so the next page load doesn't keep trying it.  Transient
      // registry-fetch failures (issuer_validation_failed) are left alone --
      // we don't want a flaky network to flush a good cache.
      if (validationResult.error === 'invalid_issuer') {
        await clearStoredIssuer(logger, 'stored issuer no longer in registry')
      }
      return {
        status: 'failed',
        error: validationResult.error,
      }
    }

    // TODO: Should we validate the stored issuer before requesting an auth
    // code?  In principle the issuer should already have been validated during
    // a previous auth flow, so the only concern would be if the value in
    // localStorage was somehow tampered with, and it'd be nice to avoid the
    // latency of an extra network request.
    return await requestAuthCode(storedIssuer, logger)
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

const requestAuthCode = async (issuer: string, logger: Logger | undefined): Promise<never> => {
  await logger?.log('Preparing authorization request')

  const code_verifier = createPKCECodeVerifier()
  const code_challenge = await createPKCECodeChallenge(code_verifier)
  const state = createOAuthState()

  // TODO: Think about ways to deal with query string parameters / url fragments
  // in current location url.  One option is to stash them in session storage,
  // and restore them if/when modulus redirects back.  Or, we could relax the
  // OAuth conformance a bit and allow the redirect_uri to contain a fragment or
  // extra query parameters (other than the reserved ones the agent itself
  // uses).  For now, we just strip any existing query parameters or fragment from
  // the current url, and use that as the redirect_uri.
  const redirect_uri = getOAuthRedirectUri()

  // TODO: This request conforms to RFC 7636, but seems a bit redundant in our
  // case.  For example, we only ever support response_type = 'code' and
  // code_challenge_method = 'S256', and we always set the client_id equal to
  // the redirect_uri, so do we really need to transmit those?
  const requestParams = {
    response_type: 'code',
    client_id: redirect_uri,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method: 'S256',
  }

  await logger?.log('Auth request parameters:', JSON.stringify(requestParams, null, 2))

  const requestUrl = new URL('/routes/agent/authorize', issuer)
  requestUrl.search = new URLSearchParams(requestParams).toString()

  await logger?.log('Redirecting to', requestUrl.toString())

  window.sessionStorage.setItem('oauth_code_verifier', code_verifier)
  window.sessionStorage.setItem('oauth_state', state)
  window.sessionStorage.setItem('issuer', issuer)

  // NOTE: This redirects to requestUrl, which immediately unloads the current
  // page and discontinues all further javascript execution.  In other words,
  // this function never returns.
  window.location.assign(requestUrl)

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
  const storedState = window.sessionStorage.getItem('oauth_state')
  const code_verifier = window.sessionStorage.getItem('oauth_code_verifier')
  const issuer = window.sessionStorage.getItem('issuer')

  window.sessionStorage.removeItem('oauth_state')
  window.sessionStorage.removeItem('oauth_code_verifier')
  window.sessionStorage.removeItem('issuer')

  // Drop any cached issuer up front; the success branch below re-sets it after
  // a successful token exchange.  This way every failure return path implicitly
  // leaves localStorage clean, so the next page load won't keep retrying a
  // gradebook that just refused us (e.g., access_denied, expired session).
  await clearStoredIssuer(logger, 'auth response received; will re-set on success')

  if (state == null) {
    await logger?.log('OAuth state not supplied')
    return {
      status: 'failed',
      error: 'malformed_oauth_response',
    }
  }

  // If the state in the response doesn't match the stored state, report an
  // error and make no further attempt at auth.
  if (state !== storedState) {
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
      issuer,
      redirect_uri: getOAuthRedirectUri(),
    })
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

  // If we're missing the issuer, report an error and make no further attempt at
  // auth.
  if (issuer == null) {
    await logger?.log('Modulus base url not found')
    return {
      status: 'failed',
      error: 'oauth_state_mismatch',
    }
  }

  // If we're missing the code verifier, report an error and make no further
  // attempt at auth.
  if (code_verifier == null) {
    await logger?.log('OAuth code verifier not found')
    return {
      status: 'failed',
      error: 'oauth_state_mismatch',
    }
  }

  const redirect_uri = getOAuthRedirectUri()

  const requestParams = {
    grant_type: 'authorization_code',
    code,
    client_id: redirect_uri,
    redirect_uri,
    code_verifier,
  }

  await logger?.log('Token request parameters:', JSON.stringify(requestParams))

  const requestUrl = new URL('/routes/agent/token', issuer)
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
      const { api_base_url, access_token, user } = await response.json()
      await logger?.log(
        'Received token response:',
        JSON.stringify({ access_token, api_base_url, user })
      )
      window.localStorage.setItem(MODULUS_BASE_URL_STORAGE_KEY, issuer)
      return {
        status: 'authenticated',
        baseUrl: api_base_url,
        token: access_token,
        user,
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

const MODULUS_BASE_URL_STORAGE_KEY = 'modulus_base_url'

const clearStoredIssuer = async (logger: Logger | undefined, reason: string) => {
  const previous = window.localStorage.getItem(MODULUS_BASE_URL_STORAGE_KEY)
  if (previous == null) return
  window.localStorage.removeItem(MODULUS_BASE_URL_STORAGE_KEY)
  await logger?.log('Cleared stored Modulus issuer:', { previous, reason })
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
const OAUTH_CODE_PARAM = 'code'
const OAUTH_STATE_PARAM = 'state'
const OAUTH_ERROR_PARAM = 'error'
const OAUTH_ERROR_DESCRIPTION_PARAM = 'error_description'
const OAUTH_ERROR_URI_PARAM = 'error_uri'

const getQueryParams = () => {
  const query = new URLSearchParams(window.location.search)
  const state = query.get(OAUTH_STATE_PARAM)
  const code = query.get(OAUTH_CODE_PARAM)
  const error = query.get(OAUTH_ERROR_PARAM)
  const error_description = query.get(OAUTH_ERROR_DESCRIPTION_PARAM)
  const error_uri = query.get(OAUTH_ERROR_URI_PARAM)
  const issuer = query.get(MODULUS_BASE_URL_PARAM)

  query.delete(OAUTH_STATE_PARAM)
  query.delete(OAUTH_CODE_PARAM)
  query.delete(OAUTH_ERROR_PARAM)
  query.delete(OAUTH_ERROR_DESCRIPTION_PARAM)
  query.delete(OAUTH_ERROR_URI_PARAM)
  query.delete(MODULUS_BASE_URL_PARAM)

  const newUrl = new URL(window.location.href)
  newUrl.search = query.toString()
  window.history.replaceState(null, '', newUrl)

  return { state, code, error, error_description, error_uri, issuer }
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
