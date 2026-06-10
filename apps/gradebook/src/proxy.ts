// NOTE: 2024-07-12 - i18n has been rewritten to use a React
// Server Action to set the language cookie and all of the middleware
// functions have been rewritten - so only portions from the links
// below remain.
// https://react.i18next.com/
// https://locize.com/blog/next-app-dir-i18n/
// https://github.com/HamedBahram/next-i18n/blob/remove-default-locale/middleware.ts
// https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
// https://github.com/vercel/next.js/discussions/54907

import type { NextRequest } from 'next/server'

import { composeProxy, withFilter, withSwitch } from './middleware/compose'
import { withActivity } from './middleware/withActivity'
import { withAdminAuth } from './middleware/withAdminAuth'
import { withAdminSession } from './middleware/withAdminSession'
import { withCSP } from './middleware/withCSP'
import { withCurrentPath } from './middleware/withCurrentPath'
import { withDeploymentMode } from './middleware/withDeploymentMode'
import { withFlash } from './middleware/withFlash'
import { withI18n } from './middleware/withI18n'
import { withNonce } from './middleware/withNonce'
import { withPrefersColorScheme } from './middleware/withPrefersColorScheme'
import { withRequestId } from './middleware/withRequestId'
import { withUserAuth } from './middleware/withUserAuth'
// import { withUserAuth } from './middleware/withUserAuth'
import { withUserSession } from './middleware/withUserSession'

const isNotApiRoute = (request: NextRequest) =>
  request.nextUrl.pathname.startsWith('/routes') === false

const isAdminRoute = (request: NextRequest) =>
  request.nextUrl.pathname.startsWith('/admin') === true

export default composeProxy([
  withRequestId,
  // Deployment-mode gate: rejects routes this instance does not serve before any
  // session/CSP/i18n work runs. Applies to every matched route, including the
  // /routes/* API handlers (the /lti/* pages are matcher-excluded and gated by
  // their layout instead -- see withDeploymentMode and app/lti/layout.tsx).
  withDeploymentMode,
  withFilter(
    isNotApiRoute,
    withCurrentPath,
    withFlash,
    withNonce,
    withCSP,
    withPrefersColorScheme,
    withSwitch(
      [isAdminRoute, withAdminSession, withAdminAuth],
      [() => true, withUserSession, withUserAuth]
    ),
    withActivity,
    withI18n
  ),
])

// https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - lti (the chromeless LTI launch/deep-link pages, gated by their own layout)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and the other static assets listed below
     *
     * NOTE: the API route handlers live under /routes (not /api), so they are
     * intentionally NOT excluded here -- the proxy runs on them, but the UI
     * layers are skipped inside the chain via the isNotApiRoute filter. Top-level
     * layers (withRequestId, withDeploymentMode) still apply to /routes/*.
     */
    {
      source:
        '/((?!assets|fonts|images|lti|_next/static|_next/image|opengraph-image|twitter-image|robots.txt|sitemap.xml|manifest.json|android-chrome-192x192.png|android-chrome-512x512.png|apple-touch-icon.png|browserconfig.xml|mstile-150x150.png|safari-pinned-tab.svg|site.webmanifest|favicon.ico|favicon.png|favicon-.*.png|modulus-icon-.*.png|web-app-manifest-.*.png|screenshot-.*.png|sprite.svg|external-link-dark.svg|external-link-light.svg|modules/js/script.js|modules/api/event).*)',
      // '/((?!assets|fonts|images|api|_next/static|_next/image|opengraph-image|twitter-image|manifest|favicon.ico|sprite.svg).*)'
      // TODO: we've disabled prefetch on most links for now - because they need
      // the locale rewrite rules above, but NOT the CSP rules.
      // Ignores prefetch links
      // missing: [
      //   { type: 'header', key: 'next-router-prefetch' },
      //   { type: 'header', key: 'purpose', value: 'prefetch' }
      // ]
    },
  ],
}
