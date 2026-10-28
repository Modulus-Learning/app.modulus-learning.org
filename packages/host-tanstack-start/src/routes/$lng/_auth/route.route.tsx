import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'

import { i18nConfig } from '@/i18n/i18n-config'
import { localeOutputRewrite } from '@/i18n/locale-rewrite'
import { pageHead } from '@/lib/head'
import { ssrRecoveryHref } from '@/lib/session/bootstrap'
import { renewInBrowser } from '@/lib/session/browser-renewal'
import { resolveGuardedSession } from '@/lib/session/route-guard'
import { SessionGuardError } from '@/lib/session/session-retry'
import { getUserSessionFn } from '@/modules/app/session/session-state'
import type { RouteContext, RouteParams } from '@/lib/route-params'

/** Ability required per protected area, as the Next `withUserAuth` layer enforced it. */
const REQUIRED_ABILITY: Array<[RegExp, string]> = [
  [/^\/dashboard(\/|$)/, 'access_dashboard'],
  [/^\/account(\/|$)/, 'account:read_own'],
]

/**
 * The signed-in learner/instructor area (`/dashboard/**`, `/account`). Replaces
 * the Next `withUserAuth` proxy layer: an anonymous visitor goes to sign-in
 * with a callback; a signed-in user without the ability goes home. An expired
 * but renewable session renews in place on client navigation, or via the
 * bootstrap page on a server render (spec: Authentication And Sessions, item 5).
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { themeContext: 'protected' },
    beforeLoad: async ({ location, params }) => {
      const visible = localeOutputRewrite(new URL(location.href, 'http://internal'))
      const path = visible.pathname
      const localePrefix =
        (params as RouteParams).lng === i18nConfig.defaultLocale
          ? ''
          : `/${(params as RouteParams).lng}`
      const clean =
        localePrefix && path.startsWith(localePrefix)
          ? path.slice(localePrefix.length) || '/'
          : path

      const decision = await resolveGuardedSession({
        domain: 'user',
        load: () => getUserSessionFn(),
        renew: () => renewInBrowser('user'),
        isServer: typeof window === 'undefined',
      })
      if (decision.kind === 'ssr-recovery') {
        throw redirect({ href: ssrRecoveryHref('user', `${path}${visible.search}`) })
      }

      const required = REQUIRED_ABILITY.find(([pattern]) => pattern.test(clean))?.[1]
      if (decision.kind === 'anonymous') {
        throw redirect({
          href: `${localePrefix}/sign-in?callbackUrl=${encodeURIComponent(path)}`,
        })
      }
      if (required != null && !decision.session.abilities.includes(required)) {
        throw redirect({ href: localePrefix || '/' })
      }
      return { session: decision.session }
    },
    // A transient renewal failure: manual retry, not sign-in (review R3).
    errorComponent: SessionGuardError,
    loader: ({ context }) => ({ session: (context as RouteContext).session }),
    head: ({ matches }) =>
      pageHead({ title: 'Dashboard', description: 'Dashboard home...' }, matches),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
    notFoundComponent: lazyRouteComponent(() => import('./route.page'), 'NotFound'),
  })
  return Route
}
