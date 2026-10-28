import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'

import { i18nConfig } from '@/i18n/i18n-config'
import { localeOutputRewrite } from '@/i18n/locale-rewrite'
import { pageHead } from '@/lib/head'
import { ssrRecoveryHref } from '@/lib/session/bootstrap'
import { renewInBrowser } from '@/lib/session/browser-renewal'
import { resolveGuardedSession } from '@/lib/session/route-guard'
import { SessionGuardError } from '@/lib/session/session-retry'
import { getAdminSessionFn } from '@/modules/admin/session/session-state'
import type { RouteParams } from '@/lib/route-params'

/**
 * The authenticated admin area. Replaces the Next `withAdminAuth` proxy layer:
 * no admin session → `/admin/sign-in?callbackUrl=…` (locale-prefixed); a
 * session without `access_admin` → home. An expired but renewable session
 * renews in place on client navigation, or via the bootstrap on a server
 * render (spec: Authentication And Sessions, item 5).
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    beforeLoad: async ({ location, params }) => {
      const visible = localeOutputRewrite(new URL(location.href, 'http://internal'))
      const localePrefix =
        (params as RouteParams).lng === i18nConfig.defaultLocale
          ? ''
          : `/${(params as RouteParams).lng}`

      const decision = await resolveGuardedSession({
        domain: 'admin',
        load: () => getAdminSessionFn(),
        renew: () => renewInBrowser('admin'),
        isServer: typeof window === 'undefined',
      })
      if (decision.kind === 'ssr-recovery') {
        throw redirect({
          href: ssrRecoveryHref('admin', `${visible.pathname}${visible.search}`),
        })
      }

      if (decision.kind === 'anonymous') {
        throw redirect({
          href: `${localePrefix}/admin/sign-in?callbackUrl=${encodeURIComponent(visible.pathname)}`,
        })
      }
      if (!decision.session.abilities?.includes('access_admin')) {
        throw redirect({ href: localePrefix || '/' })
      }
      return { adminSession: decision.session }
    },
    // A transient renewal failure: manual retry, not sign-in (review R3).
    errorComponent: SessionGuardError,
    head: ({ matches }) => pageHead({ title: 'Admin', path: '/admin' }, matches),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
    notFoundComponent: lazyRouteComponent(() => import('./route.page'), 'NotFound'),
  })
  return Route
}
