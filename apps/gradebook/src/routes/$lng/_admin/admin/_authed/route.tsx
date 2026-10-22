import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'

import { i18nConfig } from '@/i18n/i18n-config'
import { localeOutputRewrite } from '@/i18n/locale-rewrite'
import { pageHead } from '@/lib/head'
import { ssrRecoveryHref } from '@/lib/session/bootstrap'
import { renewInBrowser } from '@/lib/session/browser-renewal'
import { getAdminSessionFn } from '@/modules/admin/session/session-state'
import { AdminAppBar } from '@/ui/components/admin/admin-app-bar'
import { Content } from '@/ui/components/admin/content'
import { MenuDrawer } from '@/ui/components/admin/menu-drawer'
import { MenuProvider } from '@/ui/components/admin/menu-provider'
import { NotFoundView } from '@/ui/components/not-found-view'

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

    let snapshot = await getAdminSessionFn()
    if (snapshot.session == null && snapshot.renewable) {
      if (typeof window === 'undefined') {
        throw redirect({
          href: ssrRecoveryHref('admin', `${visible.pathname}${visible.search}`),
        })
      }
      const outcome = await renewInBrowser('admin')
      if (outcome.status === 'renewed' || outcome.status === 'unchanged') {
        snapshot = await getAdminSessionFn()
      }
    }

    if (snapshot.session == null) {
      throw redirect({
        href: `${localePrefix}/admin/sign-in?callbackUrl=${encodeURIComponent(visible.pathname)}`,
      })
    }
    if (!snapshot.session.abilities?.includes('access_admin')) {
      throw redirect({ href: localePrefix || '/' })
    }
    return { adminSession: snapshot.session }
  },
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
