import { getCookie } from '@tanstack/react-start/server'

import type { AdminSession, UserSession } from '@modulus-learning/core'

import { getServerConfig } from '@/config'
import { getCoreTokenVerifiers } from '@/lib/core/instance'
import { oncePerRequest } from '@/lib/request-scope'
import { getServerLogger } from '@/lib/server-logger'
import { classifySession, type SessionState } from './state'

/**
 * The TanStack Start host's session readers: verify the access cookie for the
 * current request, once per request, and never rotate credentials. Replaces
 * the Next `getUserSession` / `getAdminSession` and their React `cache()`.
 * Server-only.
 */

export const getUserSessionState = (): Promise<SessionState<UserSession>> =>
  oncePerRequest('session:user', async () => {
    const { userSession, userRefresh } = getServerConfig().cookies
    const access = getCookie(userSession.name)
    const hasRefresh = getCookie(userRefresh.name) != null
    if (access == null) return classifySession<UserSession>(null, hasRefresh)
    const verifiers = await getCoreTokenVerifiers(getServerLogger())
    return classifySession(await verifiers.user.verifyAccessToken(access), hasRefresh)
  })

export const getAdminSessionState = (): Promise<SessionState<AdminSession>> =>
  oncePerRequest('session:admin', async () => {
    const { adminSession, adminRefresh } = getServerConfig().cookies
    const access = getCookie(adminSession.name)
    const hasRefresh = getCookie(adminRefresh.name) != null
    if (access == null) return classifySession<AdminSession>(null, hasRefresh)
    const verifiers = await getCoreTokenVerifiers(getServerLogger())
    return classifySession(await verifiers.admin.verifyAccessToken(access), hasRefresh)
  })
