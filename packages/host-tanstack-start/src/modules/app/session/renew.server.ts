import { getCookie, setCookie, setResponseHeader } from '@tanstack/react-start/server'

import type { UserSession } from '@modulus-learning/core'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { getUserSessionState } from '@/lib/session/context'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'
import { principalOf } from '@/lib/session/principal'
import { type RenewalOutcome, renewSession } from '@/lib/session/renewal'

/** Server half of `renewUserSession` (see `./renew`). */
export const renew = async (): Promise<RenewalOutcome> => {
  setResponseHeader('Cache-Control', 'no-store')
  const { userSession, userRefresh } = getServerConfig().cookies
  const core = await getCoreCommands()
  return renewSession<UserSession>({
    state: await getUserSessionState(),
    refreshToken: getCookie(userRefresh.name),
    principalOf: (session) => principalOf('user', session),
    refresh: (refreshToken) =>
      core.app.session.refreshTokens(getCoreRequestContext(), { refreshToken }),
    cookieWrites: (tokens) => sessionCookieWrites(tokens as TokenPair, userSession, userRefresh),
    writeCookie: ({ name, value, options }) => setCookie(name, value, options),
  })
}
