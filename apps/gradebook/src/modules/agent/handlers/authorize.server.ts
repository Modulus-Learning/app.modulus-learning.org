import { DEFAULT_SCOPE_ID, isUsableRedirectUri } from '@modulus-learning/core'
import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/lib/core/start-adapter'
import { getServerLogger } from '@/lib/server-logger'
import type { AgentErrorSlug } from '@/modules/agent/error-slug'

const errorPageRedirect = (request: Request, code: AgentErrorSlug) =>
  new Response(null, {
    status: 307,
    headers: { Location: new URL(`/agent/error?code=${code}`, request.url).href },
  })

const redirect307 = (url: URL) =>
  new Response(null, { status: 307, headers: { Location: url.href } })

/**
 * The agent's OAuth 2.0 authorization endpoint (authorization code + PKCE).
 * See `docs/AUTHN-AUTHZ.md` → "The Authorization Endpoint's Branch Ordering"
 * for why the checks run in this order; ported unchanged from the Next handler.
 */
export const handleAgentAuthorize = async (request: Request): Promise<Response> => {
  const query = new URL(request.url).searchParams
  const response_type = query.get('response_type')
  const client_id = query.get('client_id')
  const redirect_uri = query.get('redirect_uri')
  const state = query.get('state')
  const code_challenge = query.get('code_challenge')
  const code_challenge_method = query.get('code_challenge_method')
  const requestedScopeId = query.get('scope_id')
  const parsedScope = z.uuid().safeParse(requestedScopeId ?? DEFAULT_SCOPE_ID)
  const logger = getServerLogger()

  if (!parsedScope.success) {
    logger.warn(
      { scope_id_present: requestedScopeId != null },
      'malformed agent authorization scope label'
    )
  }

  // A redirect URI that is not an admissible activity URL never receives a
  // redirect: the error goes to the tool's own page instead.
  if (redirect_uri == null || !isUsableRedirectUri(redirect_uri)) {
    logger.warn(
      { redirect_uri_present: redirect_uri != null },
      'agent authorization rejected an unusable redirect uri'
    )
    return errorPageRedirect(request, 'invalid_request')
  }

  const redirectURL = new URL(redirect_uri)
  const redirectParams = new URLSearchParams(state == null ? {} : { state })

  type OAuthError = 'invalid_request' | 'access_denied' | 'unauthorized_client' | 'server_error'
  const bounceWithError = (error: OAuthError) => {
    redirectParams.set('error', error)
    redirectURL.search = redirectParams.toString()
    return redirect307(redirectURL)
  }

  if (
    response_type !== 'code' ||
    client_id == null ||
    state == null ||
    code_challenge == null ||
    code_challenge_method !== 'S256' ||
    !parsedScope.success
  ) {
    return bounceWithError('invalid_request')
  }

  if (client_id !== redirect_uri) {
    return bounceWithError('invalid_request')
  }

  logger.info(
    { scope_id: parsedScope.data, source: requestedScopeId == null ? 'default' : 'client' },
    'agent authorization scope selected'
  )

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return bounceWithError('access_denied')
  }

  const core = await getCoreCommands()
  const result = await core.agent.auth.createAuthCode(userAuth, {
    client_id,
    redirect_uri,
    code_challenge,
    scope_id: parsedScope.data,
  })

  if (!result.ok) {
    if (result.error.code === 'ERR_ACTIVITY_URL_NOT_ALLOWED') {
      return bounceWithError('unauthorized_client')
    }
    if (result.error.code === 'ERR_VALIDATION') {
      return bounceWithError('invalid_request')
    }
    return bounceWithError('server_error')
  }

  redirectParams.set('code', result.data.code)
  redirectURL.search = redirectParams.toString()
  return redirect307(redirectURL)
}
