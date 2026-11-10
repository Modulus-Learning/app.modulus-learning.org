import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { seeOther } from '@/lib/http'
import { getServerLogger } from '@/lib/server-logger'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'
import { errorSlugFor } from '@/modules/lti/error-slug'
import { selectLaunchDestination } from '@/modules/lti/launch-destination'

/**
 * The response the platform sends back to the tool in response to an
 * AuthRedirect (on success).
 */
const authenticationResponseSchema = z.object({
  id_token: z.string(),
  state: z.string(),
})

/**
 * Handler for the LTI 'authentication response', in which the platform responds
 * to an authentication request with an id token (which contains the parameters
 * for a Resource Link Launch Request).
 *
 * https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
 * https://www.imsglobal.org/spec/lti/v1p3/#resource-link-launch-request-message
 *
 * Validates the 'state' parameter against its cookie, has core verify the id
 * token and resolve the user, activity and activity code, sets the learner
 * session cookies, and redirects onward. Every hop leaves as a 303 so the
 * platform's POST body is never replayed.
 */
export const handleLtiLaunch = async (request: Request): Promise<Response> => {
  const core = await getCoreCommands()
  const log = getServerLogger()

  const body = await request.formData()
  const parseResult = authenticationResponseSchema.safeParse(Object.fromEntries(body))
  if (!parseResult.success) {
    log.error({
      lti_launch: {
        status: 'failed',
        message: 'invalid lti authentication response',
        error: parseResult.error,
      },
    })
    // TODO: An LTI-conformant error response to the *platform* is still
    // outstanding, here and below. The redirect is the first-party surface
    // only -- it tells the learner what to do, not the platform what failed.
    return seeOther(request, '/lti/error?code=invalid_request')
  }
  const { id_token, state } = parseResult.data

  // Read state cookie, and use it to find the platform 'issuer'.
  const stateCookieName = `state-${state}`
  const issuer = getCookie(stateCookieName)
  if (issuer == null) {
    return seeOther(request, '/lti/error?code=session_expired')
  }

  // Delete the state cookie now, so that even if an error is raised later the
  // cookie gets cleaned up.
  deleteCookie(stateCookieName, {
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/routes/lti/launch',
  })

  const launchResult = await core.app.lti.handleLaunch(getCoreRequestContext(), {
    id_token,
    issuer,
  })
  if (!launchResult.ok) {
    log.error({
      lti_launch: { status: 'failed', message: 'error in lti launch', error: launchResult.error },
    })
    return seeOther(request, `/lti/error?code=${errorSlugFor(launchResult.error.code)}`)
  }

  const { type, tokens } = launchResult.data
  const { userSession, userRefresh } = getServerConfig().cookies
  for (const { name, value, options } of sessionCookieWrites(
    tokens as TokenPair,
    userSession,
    userRefresh
  )) {
    setCookie(name, value, options)
  }

  if (type === 'start-activity') {
    const { activity_id, activity_url, scope_id, modulus_server_url } = launchResult.data
    // Neither mode branches on the launching user's LTI role, and neither
    // carries the activity code onward: `handleActivityLaunch` has already
    // resolved it and made the enrollment decision.
    return seeOther(
      request,
      selectLaunchDestination({
        mode: getServerConfig().lti.launchInterstitial,
        activityId: activity_id,
        activityUrl: activity_url,
        scopeId: scope_id,
        modulusServerUrl: modulus_server_url,
      })
    )
  }

  if (type === 'deep-link') {
    return seeOther(request, `/lti/deep-link?id=${launchResult.data.launch_id}`)
  }

  return seeOther(request, '/dashboard')
}
