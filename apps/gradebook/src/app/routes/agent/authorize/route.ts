import { type NextRequest, NextResponse } from 'next/server'

import { DEFAULT_SCOPE_ID, isUsableRedirectUri } from '@modulus-learning/core'
import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { AgentErrorSlug } from '@/modules/agent/error-slug'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The dead end for a request with no safe destination.
 *
 * The slug is a checked literal and is the *only* thing put in the query
 * string. Next serializes the request URL into the RSC flight payload of the
 * served HTML, so any value placed here would reach the response body whatever
 * the page renders -- which is exactly what a rejected `redirect_uri` must
 * never do.
 */
const errorPageRedirect = (request: NextRequest, code: AgentErrorSlug) =>
  NextResponse.redirect(new URL(`/agent/error?code=${code}`, request.nextUrl.origin), 307)

/**
 * Authorization endpoint for OAuth 2.0 authorization code flow with PKCE.
 *
 * Expects an OAuth authorization code request in the query string.  If a user
 * is logged in, generates an auth code for that user and redirects back to the
 * specified redirect_uri with the code (and `state`) in the query string.  If a
 * user is not logged in, redirects back to the redirect_uri with
 * `error=access_denied`; the agent surfaces that as a "session has ended" state
 * and prompts the learner to re-launch from their LMS.  (A dedicated sign-in
 * page that stores the request and resumes it after authentication is not
 * implemented -- see the non-LMS sign-in flow follow-up.)
 *
 * The branches below run in a fixed order, and it is load-bearing:
 *
 *   1. `redirect_uri` unusable        -> /agent/error; never redirect
 *   2. request otherwise malformed    -> back with state + invalid_request
 *   3. no Modulus session             -> back with state + access_denied
 *   4. otherwise createAuthCode()     -> back with state + code, or an error
 *
 * Steps 2 and 3 consult no policy, so there is at most one core call per
 * request, on the authenticated branch only.
 *
 * **This endpoint remains an open redirect, knowingly.** Steps 2, 3 and 4 all
 * bounce the browser to a syntactically valid `redirect_uri` without asking the
 * sitewide allowlist, so it can still be pointed at any https origin an
 * attacker chooses. What step 1 removes is narrower: the credentialed-host
 * disguise (`https://modulus.example@evil.example/`), `javascript:` and `data:`
 * destinations, and the unhandled 500 that a value `new URL()` cannot parse
 * used to produce. Closing the bounce means replacing it with a Modulus page
 * and a return link -- a learner-visible change needing stakeholder input,
 * because session expiry is the common path here and today it resolves with no
 * learner action at all. Do not read this gate as broader than it is.
 */
export const GET = async (request: NextRequest) => {
  // Extract request parameters.
  // TODO: Use a proper zod schema to validate these parameters
  const query = request.nextUrl.searchParams
  const response_type = query.get('response_type')
  const client_id = query.get('client_id')
  const redirect_uri = query.get('redirect_uri')
  const state = query.get('state')
  const code_challenge = query.get('code_challenge')
  const code_challenge_method = query.get('code_challenge_method')
  const requestedScopeId = query.get('scope_id')
  const parsedScope = z.uuid().safeParse(requestedScopeId ?? DEFAULT_SCOPE_ID)
  const logger = getLogger()

  if (!parsedScope.success) {
    logger.warn(
      { scope_id_present: requestedScopeId != null },
      'malformed agent authorization scope label'
    )
  }

  // 1. The only gate on the destination, and the only branch that does not
  //    bounce. It is deliberately stricter than `new URL()`, which accepts
  //    `javascript:` and `data:` and treats a credentialed host as a perfectly
  //    good URL. `isUsableRedirectUri` is core's own check, imported rather
  //    than reimplemented: a second definition in the host would drift from
  //    core's rules exactly as `@types/validate-urls.ts` already has.
  //
  //    A failure here means there is no safe destination and no link worth
  //    offering, so the learner gets the dead-end page. The rejected value is
  //    never echoed into it; the diagnosis stays in this log line.
  if (redirect_uri == null || !isUsableRedirectUri(redirect_uri)) {
    logger.warn(
      { redirect_uri_present: redirect_uri != null },
      'agent authorization rejected an unusable redirect uri'
    )
    return errorPageRedirect(request, 'invalid_request')
  }

  // From here the destination is syntactically safe to bounce to, so every
  // remaining failure returns the learner to their page with an OAuth error
  // rather than raw JSON no learner should ever see.
  const redirectURL = new URL(redirect_uri)
  const redirectParams = new URLSearchParams(state == null ? {} : { state })

  // The OAuth error codes this route may return. A closed union rather than a
  // bare string: `access_denied` and `unauthorized_client` mean very different
  // things to the agent, and a typo in either would be silent.
  type OAuthError = 'invalid_request' | 'access_denied' | 'unauthorized_client' | 'server_error'

  const bounceWithError = (error: OAuthError) => {
    redirectParams.set('error', error)
    redirectURL.search = redirectParams.toString()
    return NextResponse.redirect(redirectURL, 307)
  }

  // 2. The route's existing protocol validation, unchanged in what it rejects.
  //    Only the response changes.
  //
  //    When the request is malformed *because* `state` is missing there is no
  //    state to echo, and the agent reads that as `oauth_state_mismatch` and
  //    fails. That is acceptable: a request without state came from a broken
  //    client, not from a learner condition.
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

  // TODO: Get rid of this, and rethink the role of client_id -- perhaps it
  // should be the redirect_uri's domain, or perhaps it should come from a
  // registry?
  if (client_id !== redirect_uri) {
    return bounceWithError('invalid_request')
  }

  logger.info(
    {
      scope_id: parsedScope.data,
      source: requestedScopeId == null ? 'default' : 'client',
    },
    'agent authorization scope selected'
  )

  // 3. No Modulus session.
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return bounceWithError('access_denied')
  }

  // 4. The single authoritative check-and-create.
  const core = await getCoreCommands()
  const result = await core.agent.auth.createAuthCode(userAuth, {
    client_id,
    redirect_uri,
    code_challenge,
    scope_id: parsedScope.data,
  })

  if (!result.ok) {
    // `unauthorized_client`, never `access_denied`. The agent maps
    // `access_denied` to `status: 'expired'` and prompts a re-launch from the
    // LMS, which for an activity the allowlist does not admit sends the learner
    // round the same loop indefinitely. `unauthorized_client` is in the agent's
    // accepted `OAUTH_ERRORS` set, terminates at `status: 'failed'`, and is the
    // correct RFC 6749 code here given that `client_id` is the activity URL.
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
  return NextResponse.redirect(redirectURL, 307)
}
