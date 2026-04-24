import { type NextRequest, NextResponse } from 'next/server'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'
import {
  readUserSession,
  refreshCookieOptions,
  sessionCookieOptions,
} from '@/modules/app/session/storage'

// This route is excluded from the middleware chain (see proxy.ts isNotApiRoute),
// so withUserSession does not run here. It handles its own access-token decode
// and refresh, for the benefit of ClientUserSessionProvider which calls it from
// the browser after loading a cached ISR page.
const noCacheHeaders = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
}

export const GET = async (request: NextRequest) => {
  const config = getServerConfig()
  const { status, payload } = await readUserSession(request)

  if (status === 'valid') {
    return NextResponse.json(payload, { headers: noCacheHeaders })
  }

  const refreshToken = request.cookies.get(config.cookies.userRefresh.name)?.value
  if (refreshToken == null) {
    return NextResponse.json(null, { headers: noCacheHeaders })
  }

  try {
    const core = await getCoreCommands()
    const ctx = await getCoreRequestContext()
    const result = await core.app.session.refreshTokens(ctx, { refreshToken })
    if (!result.ok) {
      return NextResponse.json(null, { headers: noCacheHeaders })
    }

    const { tokens, session } = result.data
    const response = NextResponse.json(session, { headers: noCacheHeaders })
    response.cookies.set(
      config.cookies.userSession.name,
      tokens.access.token,
      sessionCookieOptions(tokens.access.expiration_in_ms)
    )
    response.cookies.set(
      config.cookies.userRefresh.name,
      tokens.refresh.token,
      refreshCookieOptions(tokens.refresh.expiration_in_ms, tokens.remember_me)
    )
    return response
  } catch {
    return NextResponse.json(null, { headers: noCacheHeaders })
  }
}
