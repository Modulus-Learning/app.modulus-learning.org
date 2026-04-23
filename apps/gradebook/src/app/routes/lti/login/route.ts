import { type NextRequest, NextResponse } from 'next/server'

import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'

/**
 * Handler for the LTI 'init login request' from the platform, which begins the
 * flow for an lti launch.
 *
 * https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
 * https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
 *
 * If everything checks out, this handler should respond with an HTTP redirect
 * to the platform's authentication endpoint with query string parameters that
 * encode an openid authentication request:
 *
 * https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
 *
 * This method also sets a CSRF cookie based on the generated 'state' value.
 * https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
 * https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.1
 */
export async function POST(request: NextRequest) {
  const core = await getCoreCommands()
  const log = getLogger()

  // Validate and extract request parameters
  const body = await request.formData()
  const parseResult = core.app.lti.handleLogin.schemas.input.safeParse(Object.fromEntries(body))
  if (!parseResult.success) {
    log.error({
      lti_login: {
        status: 'failed',
        message: 'invalid lti login request',
        error: parseResult.error,
      },
    })

    // TODO: Propert LTI error response, here and below
    return NextResponse.json({ status: 'failed', message: 'error in lti launch' })
  }

  const ctx = await getCoreRequestContext()
  const result = await core.app.lti.handleLogin(ctx, parseResult.data)
  if (!result.ok) {
    log.error({
      lti_login: {
        status: 'failed',
        message: 'error in lti login',
        error: result.error,
      },
    })
    // TODO: Respond with a proper LTI error response
    return NextResponse.json({ status: 'failed', message: 'error in lti login' })
  }

  const { redirectUrl, stateId, stateValue } = result.data

  const response = NextResponse.redirect(redirectUrl)

  // NOTE: In principle, multiple LTI launches could be in flight at once
  // (e.g. the learner middle-clicks on multiple Modulus links in short
  // succession) -- so to avoid conflict we use a base the cookie name on the
  // state value to make it unique for each launch.

  // TODO: What if any data should we put in the state cookie? As a
  // convenience we're storing the issuer (the platform identifier) for now,
  // as we need the issuer in order to verify the id_token JWT signature we
  // get in the next step of the launch flow (in the /lti/launch handler). (We
  // need the issuer in order to look up the platform's JWKS, which holds the
  // key needed to verify the JWT).  If we don't include the issuer here, we
  // have to decode the id_token without verifying it, extract the issuer, and
  // then use the issuer to validate the token.

  // TODO: The openid spec says the state should be cryptographically bound to a
  // browser cookie.  Does that mean we should sign/encrypt the state cookie
  // value?
  response.cookies.set(`state-${stateId}`, stateValue, {
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/routes/lti/launch',
    maxAge: 120,
  })

  return response
}
