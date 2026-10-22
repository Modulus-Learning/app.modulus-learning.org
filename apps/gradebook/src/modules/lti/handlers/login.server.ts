import { setCookie } from '@tanstack/react-start/server'

import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { seeOther } from '@/lib/http'
import { getServerLogger } from '@/lib/server-logger'
import { errorSlugFor } from '@/modules/lti/error-slug'

/**
 * Handler for the LTI OIDC 'login initiation' request (third-party initiated
 * login). Validates the request, has core build the authentication redirect,
 * and stores the state value in a short-lived cookie scoped to the launch
 * endpoint so the launch can verify it.
 *
 * https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
 */
export const handleLtiLogin = async (request: Request): Promise<Response> => {
  const core = await getCoreCommands()
  const log = getServerLogger()

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
    return seeOther(request, '/lti/error?code=invalid_request')
  }

  const result = await core.app.lti.handleLogin(getCoreRequestContext(), parseResult.data)
  if (!result.ok) {
    log.error({
      lti_login: { status: 'failed', message: 'error in lti login', error: result.error },
    })
    return seeOther(request, `/lti/error?code=${errorSlugFor(result.error.code)}`)
  }

  const { redirectUrl, stateId, stateValue } = result.data
  setCookie(`state-${stateId}`, stateValue, {
    sameSite: 'none',
    secure: true,
    httpOnly: true,
    path: '/routes/lti/launch',
    maxAge: 120,
  })
  return seeOther(request, redirectUrl)
}
