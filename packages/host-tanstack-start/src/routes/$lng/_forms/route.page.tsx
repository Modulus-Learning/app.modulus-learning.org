import { Outlet, useLoaderData, useParams } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'

import { SessionIdentity } from '@/lib/session/session-identity'
import { SessionRecovery } from '@/lib/session/session-recovery'
import { UserSessionProvider } from '@/modules/app/session/provider'
import { AppBarFront } from '@/ui/components/app-bar-front/index'
import { SiteFooter } from '@/ui/components/site-footer'

export const Page = function FormsLayout() {
  const { lng } = useParams({ strict: false })
  const { session, renewable } = useLoaderData({ strict: false })
  return (
    <UserSessionProvider session={session}>
      <SessionIdentity domain="user" userId={session?.user.id ?? null} />
      <SessionRecovery domain="user" renewable={renewable} />
      <div className="layout-container root flex min-h-screen flex-col">
        <AppBarFront lng={lng} />
        <main id="main-content" className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <SiteFooter lng={lng} />
        <ScrollToTop />
      </div>
    </UserSessionProvider>
  )
}
