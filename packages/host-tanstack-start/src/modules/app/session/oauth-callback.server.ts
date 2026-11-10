import { getCookie, setCookie } from '@tanstack/react-start/server'

import { google } from 'googleapis'
import { stdSerializers } from 'pino'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { redirectTo } from '@/lib/http'
import { safeCallbackPath } from '@/lib/safe-redirect'
import { getServerLogger } from '@/lib/server-logger'
import { getUserSessionState } from '@/lib/session/context'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'

/**
 * OAuth callback handling for the TanStack Start host, ported from the Next
 * server actions in `oauth-github.ts` / `oauth-google.ts` (which remain for the
 * Next app until Task 18). Behaviour, redirects (307) and error parameters are
 * unchanged. Starting an OAuth flow (the sign-in buttons) is ported with the
 * sign-in pages in Task 11.
 */

const GITHUB_STATE_COOKIE = 'oauth-github-state'
const GOOGLE_STATE_COOKIE = 'oauth-google-state'

interface GoogleOAuthState {
  csrfToken: string
  source: string
  callbackUrl?: string
}

type Provider = 'github' | 'google'

const welcomeDestination = (callbackUrl: string | null) =>
  callbackUrl != null && callbackUrl !== '/'
    ? safeCallbackPath(callbackUrl, '/dashboard?m=welcome')
    : '/dashboard?m=welcome'

const exchangeGithubCode = async (code: string) => {
  const config = getServerConfig()
  try {
    const response = await fetch(config.oauth.github.access_token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.oauth.github.client_id,
        client_secret: config.oauth.github.client_secret,
        code,
        redirect_uri: config.oauth.github.return_url,
      }),
    })
    if (response.ok) {
      return (await response.json()) as { access_token: string; scope: string; token_type: string }
    }
    getServerLogger().error({
      github_oauth: {
        error: `HTTP ${response.status} ${response.statusText}`,
        message: 'error in github exchangeCodeForAccessToken - response not ok.',
        method: 'exchangeCodeForAccessToken',
      },
    })
    return null
  } catch (error) {
    getServerLogger().error({
      github_oauth: {
        method: 'exchangeCodeForAccessToken',
        message: 'error in github exchangeCodeForAccessToken',
        error: stdSerializers.err(error as Error),
      },
    })
    return null
  }
}

const exchangeGoogleCode = async (code: string) => {
  const config = getServerConfig()
  try {
    const oauth2Client = new google.auth.OAuth2(
      config.oauth.google.client_id,
      config.oauth.google.client_secret,
      config.oauth.google.return_url
    )
    const { tokens } = await oauth2Client.getToken(code)
    if (tokens?.scope == null) return null
    for (const scope of [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ]) {
      if (!tokens.scope.includes(scope)) {
        getServerLogger().warn({ google_oauth: { missing_scope: scope } }, 'scope not granted')
      }
    }
    return tokens
  } catch (error) {
    getServerLogger().error({
      google_oauth: {
        message: 'error in exchangeCodeForTokens',
        method: 'exchangeCodeForTokens',
        error: stdSerializers.err(error as Error),
      },
    })
    return null
  }
}

/** Signs in (or links, when a learner session exists) and redirects onward. */
const completeSignIn = async (
  request: Request,
  provider: Provider,
  tokens: unknown,
  source: string,
  callbackUrl: string | null
): Promise<Response> => {
  const state = await getUserSessionState()
  const currentUserId = state.status === 'valid' ? state.session.user.id : undefined
  const core = await getCoreCommands()
  const ctx = getCoreRequestContext()
  const credentials = { remember_me: true, user_id: currentUserId }
  const result =
    provider === 'github'
      ? await core.app.session.signInGithub(ctx, {
          ...credentials,
          tokens: tokens as { access_token: string; scope: string; token_type: string },
        })
      : await core.app.session.signInGoogle(ctx, {
          ...credentials,
          tokens: tokens as Record<string, string | number | null | undefined>,
        })

  if (!result.ok) {
    const code = result.error.code
    const error =
      code === 'ERR_OTHER_LINKED_ACCOUNT'
        ? 'other_linked_account'
        : code === 'ERR_NOT_FOUND'
          ? 'not_found'
          : 'oauth'
    return redirectTo(request, `${source}?error=${error}&source=${provider}`)
  }

  const { userSession, userRefresh } = getServerConfig().cookies
  for (const { name, value, options } of sessionCookieWrites(
    result.data as TokenPair,
    userSession,
    userRefresh
  )) {
    setCookie(name, value, options)
  }
  return redirectTo(request, welcomeDestination(callbackUrl))
}

/** GitHub OAuth callback: `/routes/oauth/github`. */
export const handleGithubCallback = async (request: Request): Promise<Response> => {
  const logger = getServerLogger()
  const searchParams = new URL(request.url).searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const source = searchParams.get('source') ?? '/'
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const error = searchParams.get('error')
  const stateFromCookie = getCookie(GITHUB_STATE_COOKIE)
  const errorReturn = `${source}?error=oauth_error`

  if (error != null) {
    logger.error({
      github_oauth: {
        error,
        message: searchParams.get('error_description') ?? 'error in github oauth callback',
        method: 'GET',
      },
    })
    return redirectTo(request, errorReturn)
  }

  if (code != null && state !== stateFromCookie) {
    logger.error({
      github_oauth: {
        error: 'state mismatch',
        message: 'state mismatch in github oauth callback',
        method: 'GET',
      },
    })
    return redirectTo(request, errorReturn)
  }

  if (code == null) {
    // The Next handler returned nothing here, which Next answers with a 500.
    return new Response(null, { status: 500 })
  }

  const tokens = await exchangeGithubCode(code)
  if (tokens == null) return redirectTo(request, errorReturn)
  return completeSignIn(request, 'github', tokens, source, callbackUrl)
}

/** Google OAuth callback: `/routes/oauth/google`. The source rides in the state. */
export const handleGoogleCallback = async (request: Request): Promise<Response> => {
  const logger = getServerLogger()
  const searchParams = new URL(request.url).searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const stateFromCookie = getCookie(GOOGLE_STATE_COOKIE)

  if (state == null) {
    logger.error({
      google_oauth: {
        error: 'state missing',
        message: 'state missing in google oauth callback',
        method: 'GET',
      },
    })
    return redirectTo(request, '/')
  }

  const decodedState = JSON.parse(
    Buffer.from(state, 'base64').toString('utf-8')
  ) as GoogleOAuthState
  const errorReturn = `${decodedState.source}?error=oauth_error`

  if (error != null) {
    logger.error({
      google_oauth: {
        error,
        message: searchParams.get('error_description') ?? 'error in google oauth callback',
        method: 'GET',
      },
    })
    return redirectTo(request, errorReturn)
  }

  if (code != null && decodedState.csrfToken !== stateFromCookie) {
    logger.error({
      google_oauth: {
        error: 'state csrf mismatch',
        message: 'state csrf mismatch in google oauth callback',
        method: 'GET',
      },
    })
    return redirectTo(request, errorReturn)
  }

  if (code == null) {
    return new Response(null, { status: 500 })
  }

  const tokens = await exchangeGoogleCode(code)
  if (tokens == null) return redirectTo(request, errorReturn)
  return completeSignIn(
    request,
    'google',
    tokens,
    decodedState.source,
    decodedState.callbackUrl ?? '/'
  )
}
