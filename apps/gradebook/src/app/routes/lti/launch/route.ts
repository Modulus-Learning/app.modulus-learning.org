import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { type NextRequest, NextResponse } from 'next/server'

import z from 'zod'

import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { setUserSession } from '@/modules/app/session/storage'

/**
 * The response the platform sends back to the tool in response to an
 * AuthRedirect (on success)
 *
 * TODO: Canvas returns a few other values, including 'authenticity_token' and
 * 'lti_storage_target'.  Do we have a use for them?
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
 * This handler validates the 'state' parameter, then sends the id token to the
 * API, which verifies the token and validates the data it contains, finds or
 * creates the associated Modulus user account, and associates the LTI context
 * for this launch with the corresponding modulus user, activity and activity
 * code.  This handler then redirects to the target activity, and sets a session
 * cookie to effectively log the user in.
 */
export async function POST(request: NextRequest) {
  const core = await getCoreCommands()
  const log = getLogger()

  // Validate and extract request parameters
  const body = await request.formData()
  const parseResult = authenticationResponseSchema.safeParse(Object.fromEntries(body))
  if (!parseResult.success) {
    // TODO: Standard log format
    log.error({
      lti_launch: {
        status: 'failed',
        message: 'invalid lti authentication response',
        error: parseResult.error,
      },
    })

    // TODO: Propert LTI error response, here and below
    return NextResponse.json({ status: 'failed', message: 'error in lti launch' })
  }
  const { id_token, state } = parseResult.data

  // Read state cookie, and use it to find platform 'issuer'.
  const cookieStore = await cookies()
  const stateCookieName = `state-${state}`
  const stateCookie = cookieStore.get(stateCookieName)
  if (stateCookie == null) {
    throw new Error('Missing state cookie')
  }
  const issuer = stateCookie.value

  // Delete the state cookie now, so that even if an error is raised later the
  // cookie gets cleaned up.
  cookieStore.delete({
    name: stateCookieName,
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/routes/lti/launch',
  })

  // Handle the launch itself.
  const ctx = await getCoreRequestContext()
  const launchResult = await core.app.lti.handleLaunch(ctx, { id_token, issuer })
  if (!launchResult.ok) {
    log.error({
      lti_launch: {
        status: 'failed',
        message: 'error in lti launch',
        error: launchResult.error,
      },
    })

    // TODO: Respond with a proper LTI error response
    return NextResponse.json({ status: 'failed', message: 'error in lti launch' })
  }

  const { type, tokens } = launchResult.data

  await setUserSession(tokens)

  // Redirect to the appropriate url based on the type of launch.
  if (type === 'start-activity') {
    const { activity_code, activity_url } = launchResult.data
    redirect(`/lti/launch/${activity_code}/${activity_url}`)
  }

  if (type === 'deep-link') {
    const { launch_id } = launchResult.data
    redirect(`/lti/deep-link?id=${launch_id}`)
  }

  redirect('/dashboard')
}
