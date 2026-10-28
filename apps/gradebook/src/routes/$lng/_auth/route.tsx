import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'
import { i18nConfig } from '@modulus-learning/host-tanstack-start/i18n/i18n-config'
import { localeOutputRewrite } from '@modulus-learning/host-tanstack-start/i18n/locale-rewrite'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { ssrRecoveryHref } from '@modulus-learning/host-tanstack-start/lib/session/bootstrap'
import { renewInBrowser } from '@modulus-learning/host-tanstack-start/lib/session/browser-renewal'
import { resolveGuardedSession } from '@modulus-learning/host-tanstack-start/lib/session/route-guard'
import { SessionIdentity } from '@modulus-learning/host-tanstack-start/lib/session/session-identity'
import { SessionGuardError } from '@modulus-learning/host-tanstack-start/lib/session/session-retry'
import { UserSessionProvider } from '@modulus-learning/host-tanstack-start/modules/app/session/provider'
import { getUserSessionFn } from '@modulus-learning/host-tanstack-start/modules/app/session/session-state'
import { AppBarInside } from '@modulus-learning/host-tanstack-start/ui/components/app-bar-inside/index'
import { NotFoundView } from '@modulus-learning/host-tanstack-start/ui/components/not-found-view'
import { RouteFocusManager } from '@modulus-learning/host-tanstack-start/ui/components/route-focus-manager'
import { SiteFooter } from '@modulus-learning/host-tanstack-start/ui/components/site-footer'

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
export const Route = createFileRoute('/$lng/_auth')({
  staticData: { themeContext: 'protected' },
  beforeLoad: async ({ location, params }) => {
    const visible = localeOutputRewrite(new URL(location.href, 'http://internal'))
    const path = visible.pathname
    const localePrefix = params.lng === i18nConfig.defaultLocale ? '' : `/${params.lng}`
    const clean =
      localePrefix && path.startsWith(localePrefix) ? path.slice(localePrefix.length) || '/' : path

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
  loader: ({ context }) => ({ session: context.session }),
  head: ({ matches }) =>
    pageHead({ title: 'Dashboard', description: 'Dashboard home...' }, matches),
  component: AuthLayout,
  notFoundComponent: () => (
    <AuthChrome>
      <NotFoundView />
    </AuthChrome>
  ),
})

function AuthChrome({ children }: { children: React.ReactNode }) {
  const { lng } = Route.useParams()
  return (
    <div className="layout-container root flex min-h-screen flex-col">
      <AppBarInside lng={lng} />
      <RouteFocusManager />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter lng={lng} />
      <ScrollToTop />
    </div>
  )
}

function AuthLayout() {
  const { session } = Route.useLoaderData()
  return (
    <UserSessionProvider session={session}>
      <SessionIdentity domain="user" userId={session.user.id} />
      <AuthChrome>
        <Outlet />
      </AuthChrome>
    </UserSessionProvider>
  )
}
