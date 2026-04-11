import { cache } from 'react'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

import type { AdminSession, AdminTokens } from '@modulus-learning/core'
import type { AdminAccessTokenVerificationResult } from '@modulus-learning/core/tokens'

import { getServerConfig } from '@/config'
import { getCoreTokenVerifiers } from '@/core-adapter'

export const readAdminSession = async (
  request?: NextRequest
): Promise<AdminAccessTokenVerificationResult> => {
  const config = getServerConfig()
  const cookieJar = request ? request.cookies : await cookies()
  const accessToken = cookieJar.get(config.cookies.adminSession.name)?.value
  if (accessToken == null) {
    return { status: 'missing' }
  }

  const tokenVerifiers = await getCoreTokenVerifiers()
  return tokenVerifiers.admin.verifyAccessToken(accessToken)
}

export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const { status, payload } = await readAdminSession()
  if (status === 'valid') {
    return payload
  }
  return null
})

export const sessionCookieOptions = (expiration_in_ms: number) => {
  const config = getServerConfig()
  return {
    path: '/',
    sameSite: config.cookies.adminSession.sameSite,
    httpOnly: config.cookies.adminSession.httpOnly,
    secure: config.cookies.adminSession.secure,
    expires: expiration_in_ms + 30 * 1000, // add 30 seconds for clock skew
  }
}

export const refreshCookieOptions = (expiration_in_ms: number, remember_me: boolean) => {
  const config = getServerConfig()
  return {
    path: '/',
    sameSite: config.cookies.adminRefresh.sameSite,
    httpOnly: config.cookies.adminRefresh.httpOnly,
    secure: config.cookies.adminRefresh.secure,
    expires: remember_me
      ? expiration_in_ms + 30 * 1000 // add 30 seconds for clock skew
      : undefined,
  }
}

export const setAdminSession = async ({ access, refresh, remember_me }: AdminTokens) => {
  const config = getServerConfig()
  const cookieJar = await cookies()
  cookieJar.set(
    config.cookies.adminSession.name,
    access.token,
    sessionCookieOptions(access.expiration_in_ms)
  )
  cookieJar.set(
    config.cookies.adminRefresh.name,
    refresh.token,
    refreshCookieOptions(refresh.expiration_in_ms, remember_me)
  )
}

export const deleteAdminSession = async () => {
  const config = getServerConfig()
  const cookieJar = await cookies()
  cookieJar.delete(config.cookies.adminSession.name)
  cookieJar.delete(config.cookies.adminRefresh.name)
}
