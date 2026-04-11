'use server'
import { randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { google } from 'googleapis'
import { stdSerializers } from 'pino'

import { getServerConfig } from '@/config'
import { getCoreInstance, getCoreRequestContext, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { getUserSession, setUserSession } from './storage'
import type {
  GoogleFormState,
  GoogleOAuthCredentials,
  GoogleOAuthState,
  OAuthSessionResponse,
} from './@types/index'

const OAUTH_STATE_COOKIE_NAME = 'oauth-google-state'

// https://developers.google.com/identity/protocols/oauth2/web-server#node.js

/**
 * startGoogleOAuthFlow
 *
 * This is the top-level entrypoint for google oauth sign-in.  This function is
 * called when the user asks to sign in with google, and kicks off the oauth
 * redirect.
 *
 * @param _prevState
 * @param formData
 */
export async function startGoogleOAuthFlow(
  _prevState: GoogleFormState,
  formData: FormData
): Promise<GoogleFormState> {
  const config = getServerConfig()

  const source = formData.get('source') as string
  const callbackUrl = formData.get('callbackUrl') as string

  /**
   * To use OAuth2 authentication, we need access to a CLIENT_ID, CLIENT_SECRET, AND REDIRECT_URI.
   * To get these credentials for your application, visit
   * https://console.cloud.google.com/apis/credentials.
   */

  const oauth2Client = new google.auth.OAuth2({
    client_id: config.oauth.google.client_id,
    client_secret: config.oauth.google.client_secret,
    redirectUri: config.oauth.google.return_url,
  })

  const csrfToken = randomBytes(16).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, csrfToken, {
    path: '/',
    sameSite: config.cookies.userSession.sameSite,
    httpOnly: config.cookies.userSession.httpOnly,
    secure: config.cookies.userSession.secure,
  })

  // Combine the CSRF token and redirect path into a state object
  const stateObj: GoogleOAuthState = {
    source,
    callbackUrl,
    csrfToken,
  }

  // Encode the state object as a URL-safe base64 string
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64')

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ]

  // Generate a url that asks permissions for the Drive activity and Google Calendar scope
  const authorizationUrl = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'online',
    /** Pass in the scopes array defined above.
     * Alternatively, if only one scope is needed, you can pass a scope URL as a string */
    scope: scopes,
    // Response type
    response_type: 'code',
    // Enable incremental authorization. Recommended as a best practice.
    include_granted_scopes: true,
    // Include the state parameter to reduce the risk of CSRF attacks.
    state: state,
  })

  redirect(authorizationUrl)
}

/**
 * exchangeCodeForAccessToken
 *
 * @param code
 * @returns
 */
async function exchangeCodeForTokens(code: string): Promise<GoogleOAuthCredentials | null> {
  const logger = getLogger()
  const config = getServerConfig()

  try {
    const oauth2Client = new google.auth.OAuth2(
      config.oauth.google.client_id,
      config.oauth.google.client_secret,
      config.oauth.google.return_url
    )
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)
    // User authorized the request. Now, check which scopes were granted.
    // Simple error logging here for now, as a fully handled and logged error
    // will occur when we try to use the tokens to access user data.
    if (tokens != null && tokens.scope != null) {
      if (!tokens.scope.includes('https://www.googleapis.com/auth/userinfo.profile')) {
        console.error('User did not authorize read-only userinfo.profile.')
      }

      // Check if user authorized email read permission.
      if (!tokens.scope.includes('https://www.googleapis.com/auth/userinfo.email')) {
        console.error('User did not authorize email read permission.')
      }

      // Check if user authorized openid read permission.
      if (!tokens.scope.includes('openid')) {
        console.error('User did not authorize openid read permission.')
      }

      return tokens
    }
    return null
  } catch (error) {
    logger.error({
      google_oauth: {
        message: 'error in exchangeCodeForTokens',
        method: 'exchangeCodeForTokens',
        error: stdSerializers.err(error as Error),
      },
    })
    return null
  }
}

/**
 * getSession
 *
 * @param accessToken
 * @param rememberMe
 * @returns
 */
async function startGoogleSession(
  tokens: GoogleOAuthCredentials,
  rememberMe: boolean
): Promise<OAuthSessionResponse> {
  // If we have an existing session, the user is already logged in and is likely
  // adding or linking their Github account as an OAuth source - so we
  // send the current user's ID to the API to link the account.  TODO: We should
  // probably make this explicit.
  const currentSession = await getUserSession()

  const core = await getCoreInstance()
  // TODO: is it safe to pass user_id like this?
  const ctx = await getCoreRequestContext()
  const signInResult = await core.app.session.signInGoogle(ctx, {
    tokens,
    remember_me: rememberMe,
    user_id: currentSession?.user.id,
  })

  if (!signInResult.ok) {
    if (signInResult.error.code === 'ERR_OTHER_LINKED_ACCOUNT') {
      return {
        error_code: 'ERR_OTHER_LINKED_ACCOUNT',
        message: "The user's google ID is already linked to another account.",
        status: 'failed',
      }
    }
    return {
      error_code: 'ERROR',
      message: 'An error occurred in startGoogleSession.',
      status: 'failed',
    }
  }

  return {
    error_code: '',
    message: 'Session created.',
    status: 'success',
    tokens: signInResult.data,
  }
}

/**
 * handleGoogleOAuthResponse
 *
 * @param code
 * @param callbackUrl
 * @param errorReturn
 */
export async function handleGoogleOAuthResponse(
  code: string,
  source: string,
  callbackUrl: string,
  errorReturn: string
) {
  const tokens = await exchangeCodeForTokens(code)
  if (tokens == null) {
    redirect(errorReturn)
  }

  // TODO: should rememberMe always be true here, and if not where should we get
  // the correct value?
  const result = await startGoogleSession(tokens, true)

  if (result.status === 'failed' || result.tokens == null) {
    let updatedErrorReturn = errorReturn
    if (result.error_code === 'ERR_OTHER_LINKED_ACCOUNT') {
      updatedErrorReturn = `${source}?error=other_linked_account&source=google`
    } else if (result.error_code === 'ERR_NOT_FOUND') {
      updatedErrorReturn = `${source}?error=not_found&source=google`
    } else {
      updatedErrorReturn = `${source}?error=oauth&source=google`
    }

    redirect(updatedErrorReturn)
  }

  await setUserSession(result.tokens)
  redirect(callbackUrl)
}

export async function unlinkGoogleAccount(): Promise<GoogleFormState> {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return {
      status: 'failed',
      message: 'not logged in',
    }
  }

  const core = await getCoreInstance()
  const result = await core.app.session.unlinkGoogleAccount(userAuth)

  if (result.ok) {
    return {
      status: 'success',
    }
  }

  if (result.error.code === 'ERR_NO_OTHER_SIGN_IN') {
    return {
      status: 'failed',
      message: 'no other sign-in method registered',
    }
  }

  return {
    status: 'failed',
    message: 'failed to unlink google account',
  }
}
