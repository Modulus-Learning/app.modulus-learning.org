import { type NextRequest, NextResponse } from 'next/server'

import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  // TODO: Respond to errors by showing an error or sign-in page, or redirecting
  // to the redirect_uri (assuming it's valid) with error message in query
  // string.

  if (
    response_type !== 'code' ||
    client_id == null ||
    redirect_uri == null ||
    state == null ||
    code_challenge == null ||
    code_challenge_method !== 'S256' ||
    !parsedScope.success
  ) {
    // TODO: Show a properly-formatted error page.  Or -- is it ever appropriate
    // to redirect back with an error message here?
    return NextResponse.json(
      { error: 'error -- malformed authentication request' },
      { status: 400 }
    )
  }

  // TODO: Get rid of this, and rethink the role of client_id -- perhaps it
  // should be the redirect_uri's domain, or perhaps it should come from a
  // registry?
  if (client_id !== redirect_uri) {
    // TODO: Show a properly-formatted error page.  Or -- is it ever appropriate
    // to redirect back with an error message here?
    return NextResponse.json(
      { error: 'error -- malformed authentication request' },
      { status: 400 }
    )
  }

  logger.info(
    {
      scope_id: parsedScope.data,
      source: requestedScopeId == null ? 'default' : 'client',
    },
    'agent authorization scope selected'
  )

  const redirectURL = new URL(redirect_uri)
  const redirectParams = new URLSearchParams({ state })

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    redirectParams.set('error', 'access_denied')
    redirectURL.search = redirectParams.toString()
    return NextResponse.redirect(redirectURL, 307)
  }

  const core = await getCoreCommands()
  const result = await core.agent.auth.createAuthCode(userAuth, {
    client_id,
    redirect_uri,
    code_challenge,
    scope_id: parsedScope.data,
  })

  if (!result.ok) {
    if (result.error.code === 'ERR_VALIDATION') {
      return NextResponse.json(
        { error: 'error -- malformed authentication request' },
        { status: 400 }
      )
    }

    // TODO: Inspect result.error.code and respond with more specific error messages if appropriate.
    redirectParams.set('error', 'server_error')
    redirectURL.search = redirectParams.toString()
    return NextResponse.redirect(redirectURL, 307)
  }

  redirectParams.set('code', result.data.code)
  redirectURL.search = redirectParams.toString()
  return NextResponse.redirect(redirectURL, 307)
}
