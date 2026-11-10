import { Outlet, useLoaderData, useParams } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'

import { SessionIdentity } from '@/lib/session/session-identity'
import { UserSessionProvider } from '@/modules/app/session/provider'
import { AppBarInside } from '@/ui/components/app-bar-inside/index'
import { NotFoundView } from '@/ui/components/not-found-view'
import { RouteFocusManager } from '@/ui/components/route-focus-manager'
import { SiteFooter } from '@/ui/components/site-footer'

function AuthChrome({ children }: { children: React.ReactNode }) {
  const { lng } = useParams({ strict: false })
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
  const { session } = useLoaderData({ strict: false })
  return (
    <UserSessionProvider session={session}>
      <SessionIdentity domain="user" userId={session.user.id} />
      <AuthChrome>
        <Outlet />
      </AuthChrome>
    </UserSessionProvider>
  )
}

export const Page = AuthLayout

export const NotFound = () => (
  <AuthChrome>
    <NotFoundView />
  </AuthChrome>
)
