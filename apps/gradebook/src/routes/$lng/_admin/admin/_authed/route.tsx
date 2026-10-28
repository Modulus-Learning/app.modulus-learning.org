import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'
import { i18nConfig } from '@modulus-learning/host-tanstack-start/i18n/i18n-config'
import { localeOutputRewrite } from '@modulus-learning/host-tanstack-start/i18n/locale-rewrite'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { ssrRecoveryHref } from '@modulus-learning/host-tanstack-start/lib/session/bootstrap'
import { renewInBrowser } from '@modulus-learning/host-tanstack-start/lib/session/browser-renewal'
import { resolveGuardedSession } from '@modulus-learning/host-tanstack-start/lib/session/route-guard'
import { SessionGuardError } from '@modulus-learning/host-tanstack-start/lib/session/session-retry'
import { getAdminSessionFn } from '@modulus-learning/host-tanstack-start/modules/admin/session/session-state'
import { AdminAppBar } from '@modulus-learning/host-tanstack-start/ui/components/admin/admin-app-bar'
import { Content } from '@modulus-learning/host-tanstack-start/ui/components/admin/content'
import { MenuDrawer } from '@modulus-learning/host-tanstack-start/ui/components/admin/menu-drawer'
import { MenuProvider } from '@modulus-learning/host-tanstack-start/ui/components/admin/menu-provider'
import { NotFoundView } from '@modulus-learning/host-tanstack-start/ui/components/not-found-view'

/**
 * The authenticated admin area. Replaces the Next `withAdminAuth` proxy layer:
 * no admin session → `/admin/sign-in?callbackUrl=…` (locale-prefixed); a
 * session without `access_admin` → home. An expired but renewable session
 * renews in place on client navigation, or via the bootstrap on a server
 * render (spec: Authentication And Sessions, item 5).
 */
export const Route = createFileRoute('/$lng/_admin/admin/_authed')({
  beforeLoad: async ({ location, params }) => {
    const visible = localeOutputRewrite(new URL(location.href, 'http://internal'))
    const localePrefix = params.lng === i18nConfig.defaultLocale ? '' : `/${params.lng}`

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
  component: AdminLayout,
  notFoundComponent: () => (
    <AdminChrome>
      <NotFoundView />
    </AdminChrome>
  ),
})

function AdminChrome({ children }: { children: React.ReactNode }) {
  const { lng } = Route.useParams()
  return (
    <MenuProvider>
      <div className="layout-container root flex min-h-screen flex-col">
        <AdminAppBar lng={lng} />
        <main id="main-content" className="flex flex-1">
          <MenuDrawer lng={lng} />
          <Content>{children}</Content>
        </main>
        <ScrollToTop />
      </div>
    </MenuProvider>
  )
}

function AdminLayout() {
  return (
    <AdminChrome>
      <Outlet />
    </AdminChrome>
  )
}
