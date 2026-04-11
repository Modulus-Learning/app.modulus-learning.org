import { cache } from 'react'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

import type { UserSession, UserTokens } from '@modulus-learning/core'
import type { AccessTokenVerificationResult } from '@modulus-learning/core/tokens'

import { getServerConfig } from '@/config'
import { getCoreTokenVerifiers } from '@/core-adapter'

export const readUserSession = async (
  request?: NextRequest
): Promise<AccessTokenVerificationResult> => {
  const config = getServerConfig()
  const cookieJar = request ? request.cookies : await cookies()
  const accessToken = cookieJar.get(config.cookies.userSession.name)?.value
  if (accessToken == null) {
    return { status: 'missing' }
  }

  const tokenVerifiers = await getCoreTokenVerifiers()
  return tokenVerifiers.user.verifyAccessToken(accessToken)
}

export const getUserSession = cache(async (): Promise<UserSession | null> => {
  const { status, payload } = await readUserSession()
  if (status === 'valid') {
    return payload
  }
  return null
})

export const sessionCookieOptions = (expiration_in_ms: number) => {
  const config = getServerConfig()
  return {
    path: '/',
    sameSite: config.cookies.userSession.sameSite,
    httpOnly: config.cookies.userSession.httpOnly,
    secure: config.cookies.userSession.secure,
    expires: expiration_in_ms + 30 * 1000, // add 30 seconds for clock skew
  }
}

export const refreshCookieOptions = (expiration_in_ms: number, remember_me: boolean) => {
  const config = getServerConfig()
  return {
    path: '/',
    sameSite: config.cookies.userRefresh.sameSite,
    httpOnly: config.cookies.userRefresh.httpOnly,
    secure: config.cookies.userRefresh.secure,
    expires: remember_me
      ? expiration_in_ms + 30 * 1000 // add 30 seconds for clock skew
      : undefined,
  }
}

export const setUserSession = async ({ access, refresh, remember_me }: UserTokens) => {
  const config = getServerConfig()
  const cookieJar = await cookies()
  cookieJar.set(
    config.cookies.userSession.name,
    access.token,
    sessionCookieOptions(access.expiration_in_ms)
  )
  cookieJar.set(
    config.cookies.userRefresh.name,
    refresh.token,
    refreshCookieOptions(refresh.expiration_in_ms, remember_me)
  )
}

export const deleteUserSession = async () => {
  const config = getServerConfig()
  const cookieJar = await cookies()
  cookieJar.delete(config.cookies.userSession.name)
  cookieJar.delete(config.cookies.userRefresh.name)
}
