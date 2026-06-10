import { NextResponse } from 'next/server'

import { getDeploymentMode, isRouteAllowed } from '@/lib/deployment-mode'
import type { ProxyLayer } from './@types'

/**
 * The primary deployment-mode gate. Runs ahead of every other proxy layer so a
 * route that the current `DEPLOYMENT_MODE` does not serve is rejected before any
 * session, CSP or i18n work happens.
 *
 * Blocked routes return a 404 so a single-surface instance behaves as if the
 * other surface's routes simply do not exist (in particular, an admin-only
 * instance reveals nothing about the learner/LTI surface, and vice versa).
 *
 * Note: the `/lti/*` *pages* are excluded from the proxy matcher (see
 * `proxy.ts`) to preserve their chromeless, i18n-free handling, so they are
 * gated by the layout guard in `app/lti/layout.tsx` instead. Every `/routes/*`
 * API handler and all other UI pages flow through here.
 */
export const withDeploymentMode: ProxyLayer = (next) => {
  const mode = getDeploymentMode()

  return (request, event, context) => {
    if (!isRouteAllowed(mode, request.nextUrl.pathname)) {
      return Promise.resolve(new NextResponse('Not Found', { status: 404 }))
    }
    return next(request, event, context)
  }
}
