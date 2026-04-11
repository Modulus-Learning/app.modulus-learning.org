'use server'

// https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

import { randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { stdSerializers } from 'pino'

import { getServerConfig } from '@/config'
import { getCoreInstance, getCoreRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { getUserSession, setUserSession } from './storage'
import type { GitHubFormState, OAuthSessionResponse } from './@types/index'

const OAUTH_SCOPE = 'read:user user:email'
const OAUTH_STATE_COOKIE_NAME = 'oauth-github-state'

/**
 * gitHubSignIn
 *
 * @param _prevState
 * @param formData
 */
export async function startGithubOAuthFlow(
  _prevState: GitHubFormState,
  formData: FormData
): Promise<GitHubFormState> {
  const config = getServerConfig()

  const source = formData.get('source')
  const callbackUrl = formData.get('callbackUrl')

  const redirectQueryString = new URLSearchParams()
  if (source) {
    redirectQueryString.append('source', source.toString())
  }
  if (callbackUrl) {
    redirectQueryString.append('callbackUrl', callbackUrl.toString())
  }

  const params = new URLSearchParams()
  const state = randomBytes(16).toString('hex')

  params.append('client_id', config.oauth.github.client_id)
  params.append(
    'redirect_uri',
    `${config.oauth.github.return_url}?${redirectQueryString.toString()}`
  )
  params.append('state', state)
  params.append('scope', OAUTH_SCOPE)

  const cookieStore = await cookies()
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    path: '/',
    sameSite: config.cookies.userSession.sameSite,
    httpOnly: config.cookies.userSession.httpOnly,
    secure: config.cookies.userSession.secure,
  })

  const url = `${config.oauth.github.auth_url}?${params.toString()}`

  redirect(url)
}

interface AccessToken {
  access_token: string
  scope: string
  token_type: string
}

/**
 * exchangeCodeForAccessToken
 *
 * @param code
 * @returns
 */
export async function exchangeCodeForTokens(code: string): Promise<AccessToken | null> {
  const logger = getLogger()
  const config = getServerConfig()

  try {
    const response = await fetch(config.oauth.github.access_token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: config.oauth.github.client_id,
        client_secret: config.oauth.github.client_secret,
        code: code,
        redirect_uri: config.oauth.github.return_url,
      }),
    })

    if (response.ok) {
      return (await response.json()) as AccessToken
    }
    logger.error({
      github_oauth: {
        error: `HTTP ${response.status} ${response.statusText}`,
        message: 'error in github exchangeCodeForAccessToken - response not ok.',
        method: 'exchangeCodeForAccessToken',
      },
    })
    return null
  } catch (error) {
    logger.error({
      github_oauth: {
        method: 'exchangeCodeForAccessToken',
        message: 'error in github exchangeCodeForAccessToken',
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
export async function startGithubSession(
  accessToken: AccessToken,
  rememberMe: boolean
): Promise<OAuthSessionResponse> {
  // If we have an existing session, the user is already logged in and is likely
  // adding or linking their Github account as an OAuth source - so we send the
  // current user's ID to the API to link the account. TODO: We should probably
  // make this explicit.
  const currentSession = await getUserSession()

  const core = await getCoreInstance()
  const ctx = await getCoreRequestContext()
  const signInResult = await core.app.session.signInGithub(ctx, {
    tokens: accessToken,
    remember_me: rememberMe,
    user_id: currentSession?.user.id,
  })

  if (!signInResult.ok) {
    if (signInResult.error.code === 'ERR_OTHER_LINKED_ACCOUNT') {
      return {
        error_code: 'ERR_OTHER_LINKED_ACCOUNT',
        message: "The user's github ID is already linked to another account.",
        status: 'failed',
      }
    }

    return {
      error_code: 'ERROR',
      message: 'An error occurred in startGithubSession.',
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
 * oAuthGitHub
 *
 * @param code
 * @param callbackUrl
 * @param errorReturn
 */
export async function handleGithubOAuthResponse(
  code: string,
  source: string,
  callbackUrl: string,
  errorReturn: string
) {
  const tokens = await exchangeCodeForTokens(code)
  if (tokens == null) {
    redirect(errorReturn)
  }

  const result = await startGithubSession(tokens, true)

  if (result.status === 'failed' || result.tokens == null) {
    let updatedErrorReturn = errorReturn
    if (result.error_code === 'ERR_OTHER_LINKED_ACCOUNT') {
      updatedErrorReturn = `${source}?error=other_linked_account&source=github`
    } else if (result.error_code === 'ERR_NOT_FOUND') {
      updatedErrorReturn = `${source}?error=not_found&source=github`
    } else {
      updatedErrorReturn = `${source}?error=oauth&source=github`
    }

    redirect(updatedErrorReturn)
  }

  await setUserSession(result.tokens)
  redirect(callbackUrl)
}
