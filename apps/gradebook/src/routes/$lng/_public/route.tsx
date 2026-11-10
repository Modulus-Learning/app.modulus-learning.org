import { createFileRoute, Outlet } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { SessionIdentity } from '@modulus-learning/host-tanstack-start/lib/session/session-identity'
import { SessionRecovery } from '@modulus-learning/host-tanstack-start/lib/session/session-recovery'
import { UserSessionProvider } from '@modulus-learning/host-tanstack-start/modules/app/session/provider'
import { getUserSessionFn } from '@modulus-learning/host-tanstack-start/modules/app/session/session-state'
import { AppBarFront } from '@modulus-learning/host-tanstack-start/ui/components/app-bar-front/index'
import { NotFoundView } from '@modulus-learning/host-tanstack-start/ui/components/not-found-view'
import { SiteFooter } from '@modulus-learning/host-tanstack-start/ui/components/site-footer'

/**
 * Public layout (`/`, `/about`, `/docs`). Verification-only session for the
 * app bar; `SessionRecovery` renews in the browser when the access token has
 * just expired, then re-runs the loaders (spec: Authentication And Sessions).
 */
export const Route = createFileRoute('/$lng/_public')({
  staticData: { themeContext: 'public' },
  loader: () => getUserSessionFn(),
  head: ({ matches }) => pageHead({}, matches),
  component: PublicLayout,
  notFoundComponent: () => (
    <PublicChrome>
      <NotFoundView />
    </PublicChrome>
  ),
})

function PublicChrome({ children }: { children: React.ReactNode }) {
  const { lng } = Route.useParams()
  return (
    <div className="layout-container root flex min-h-screen flex-col">
      <AppBarFront lng={lng} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter lng={lng} />
      <ScrollToTop />
    </div>
  )
}

function PublicLayout() {
  const { session, renewable } = Route.useLoaderData()
  return (
    <UserSessionProvider session={session}>
      <SessionIdentity domain="user" userId={session?.user.id ?? null} />
      <SessionRecovery domain="user" renewable={renewable} />
      <PublicChrome>
        <Outlet />
      </PublicChrome>
    </UserSessionProvider>
  )
}
