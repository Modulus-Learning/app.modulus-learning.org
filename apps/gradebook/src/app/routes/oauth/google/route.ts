import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getLogger } from '@/lib/logger'
import { handleGoogleOAuthResponse } from '@/modules/app/session/oauth-google'
import type { GoogleOAuthState } from '@/modules/app/session/@types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OAUTH_STATE_COOKIE_NAME = 'oauth-google-state'

/**
 *
 * https://developers.google.com/identity/protocols/oauth2/web-server#node.js
 *
 * @param request
 * @returns
 */

export const GET = async (request: NextRequest) => {
  const logger = getLogger()
  const cookieStore = await cookies()
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const stateFromCookie = cookieStore.get(OAUTH_STATE_COOKIE_NAME)

  // Sadly Google OAuth is much more strict in terms of the return-to-client URL
  // which has to match exactly with the one registered, and cannot contain
  // any query string parameters. So we're not able ot get the 'source'
  // of the sign in flow early - since it's encoded in the state string / object.
  // In either case, a state error here should never occur, since we encode and send
  // state with every Google OAuth sign in request.
  if (state == null) {
    logger.error({
      google_oauth: {
        error: 'state missing',
        message: 'state missing in google oauth callback',
        method: 'GET',
      },
    })
    redirect('/')
  }

  const decodedState = JSON.parse(
    Buffer.from(state, 'base64').toString('utf-8')
  ) as GoogleOAuthState

  const errorReturn = `${decodedState.source}?error=oauth_error`

  if (error != null) {
    const error_description = searchParams.get('error_description')
    logger.error({
      google_oauth: {
        error: error,
        message: error_description ?? 'error in google oauth callback',
        method: 'GET',
      },
    })
    redirect(errorReturn)
  }

  if (code != null && decodedState.csrfToken !== stateFromCookie?.value) {
    logger.error({
      google_oauth: {
        error: 'state csrf mismatch',
        message: 'state csrf mismatch in google oauth callback',
        method: 'GET',
      },
    })
    redirect(errorReturn)
  }

  const callBackUrl = decodedState.callbackUrl ?? '/'

  if (code != null) {
    await handleGoogleOAuthResponse(code, decodedState.source, callBackUrl, errorReturn)
  }
}
