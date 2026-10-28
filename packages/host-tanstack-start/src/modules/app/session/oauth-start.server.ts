import { randomBytes } from 'node:crypto'

import { setCookie } from '@tanstack/react-start/server'

import { google } from 'googleapis'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreUserRequestContext } from '@/lib/core/start-adapter'

/**
 * Server halves of the OAuth sign-in buttons, ported from the Next actions in
 * `./oauth-github.ts` / `./oauth-google.ts`: set the state cookie and return
 * the provider URL for the browser to visit (the Next actions redirected).
 */

const stateCookieOptions = () => {
  const { userSession } = getServerConfig().cookies
  return {
    path: '/',
    sameSite: userSession.sameSite,
    httpOnly: userSession.httpOnly,
    secure: userSession.secure,
  }
}

export const githubAuthorizeUrl = (source: string | null, callbackUrl: string | null): string => {
  const config = getServerConfig()
  const returnQuery = new URLSearchParams()
  if (source) returnQuery.append('source', source)
  if (callbackUrl) returnQuery.append('callbackUrl', callbackUrl)

  const state = randomBytes(16).toString('hex')
  setCookie('oauth-github-state', state, stateCookieOptions())

  const params = new URLSearchParams({
    client_id: config.oauth.github.client_id,
    redirect_uri: `${config.oauth.github.return_url}?${returnQuery.toString()}`,
    state,
    scope: 'read:user user:email',
  })
  return `${config.oauth.github.auth_url}?${params.toString()}`
}

export const googleAuthorizeUrl = (source: string, callbackUrl: string): string => {
  const config = getServerConfig()
  const csrfToken = randomBytes(16).toString('hex')
  setCookie('oauth-google-state', csrfToken, stateCookieOptions())

  const oauth2Client = new google.auth.OAuth2({
    client_id: config.oauth.google.client_id,
    client_secret: config.oauth.google.client_secret,
    redirectUri: config.oauth.google.return_url,
  })
  return oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ],
    response_type: 'code',
    include_granted_scopes: true,
    state: Buffer.from(JSON.stringify({ source, callbackUrl, csrfToken })).toString('base64'),
  })
}

export const unlinkGoogle = async (): Promise<{
  status: 'success' | 'failed'
  message?: string
}> => {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) return { status: 'failed', message: 'not logged in' }
  const core = await getCoreCommands()
  const result = await core.app.session.unlinkGoogleAccount(userAuth)
  if (result.ok) return { status: 'success' }
  if (result.error.code === 'ERR_NO_OTHER_SIGN_IN') {
    return { status: 'failed', message: 'no other sign-in method registered' }
  }
  return { status: 'failed', message: 'failed to unlink google account' }
}
