import { getCookie, setCookie, setResponseHeader } from '@tanstack/react-start/server'

import type { AdminSession } from '@modulus-learning/core'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { getAdminSessionState } from '@/lib/session/context'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'
import { principalOf } from '@/lib/session/principal'
import { type RenewalOutcome, renewSession } from '@/lib/session/renewal'

/** Server half of `renewAdminSession` (see `./renew`). */
export const renew = async (): Promise<RenewalOutcome> => {
  setResponseHeader('Cache-Control', 'no-store')
  const { adminSession, adminRefresh } = getServerConfig().cookies
  const core = await getCoreCommands()
  return renewSession<AdminSession>({
    state: await getAdminSessionState(),
    refreshToken: getCookie(adminRefresh.name),
    principalOf: (session) => principalOf('admin', session),
    refresh: (adminRefreshToken) =>
      core.admin.session.refreshTokens(getCoreRequestContext(), { adminRefreshToken }),
    cookieWrites: (tokens) => sessionCookieWrites(tokens as TokenPair, adminSession, adminRefresh),
    writeCookie: ({ name, value, options }) => setCookie(name, value, options),
  })
}
