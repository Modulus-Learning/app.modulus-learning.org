import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getLogger } from '@/lib/logger'
import { handleGithubOAuthResponse } from '@/modules/app/session/oauth-github'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OAUTH_STATE_COOKIE_NAME = 'oauth-github-state'

/**
  https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */

export const GET = async (request: NextRequest) => {
  const logger = getLogger()
  const cookieStore = await cookies()
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const source = searchParams.get('source') ?? '/'
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const error = searchParams.get('error')
  const stateFromCookie = cookieStore.get(OAUTH_STATE_COOKIE_NAME)
  const errorReturn = `${source}?error=oauth_error`

  if (error != null) {
    const error_description = searchParams.get('error_description')
    logger.error({
      github_oauth: {
        error: error,
        message: error_description ?? 'error in github oauth callback',
        method: 'GET',
      },
    })
    redirect(errorReturn)
  }

  if (code != null && state !== stateFromCookie?.value) {
    logger.error({
      github_oauth: {
        error: 'state mismatch',
        message: 'state mismatch in github oauth callback',
        method: 'GET',
      },
    })
    redirect(errorReturn)
  }

  if (code != null) {
    await handleGithubOAuthResponse(code, source, callbackUrl, errorReturn)
  }
}
