import { NextResponse } from 'next/server'

import { pathWithoutLocale } from '@/i18n/utils'
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
 * One exception: on an `admin` instance the bare host (`/`, or a bare locale
 * root such as `/es`) would otherwise 404, since the learner frontend it
 * normally serves is not present. Rather than dead-end the apex, we redirect it
 * to the admin sign-in entry point. Every other frontend route still 404s.
 *
 * Note: the `/lti/*` *pages* are excluded from the proxy matcher (see
 * `proxy.ts`) to preserve their chromeless, i18n-free handling, so they are
 * gated by the layout guard in `app/lti/layout.tsx` instead. Every `/routes/*`
 * API handler and all other UI pages flow through here.
 */
export const withDeploymentMode: ProxyLayer = (next) => {
  const mode = getDeploymentMode()

  return (request, event, context) => {
    const { pathname } = request.nextUrl

    if (mode === 'admin' && pathWithoutLocale(pathname) === '/') {
      return Promise.resolve(NextResponse.redirect(new URL('/admin/sign-in', request.url)))
    }

    if (!isRouteAllowed(mode, pathname)) {
      return Promise.resolve(new NextResponse('Not Found', { status: 404 }))
    }
    return next(request, event, context)
  }
}
