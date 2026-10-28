import { createFileRoute, Outlet } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { SessionIdentity } from '@modulus-learning/host-tanstack-start/lib/session/session-identity'
import { SessionRecovery } from '@modulus-learning/host-tanstack-start/lib/session/session-recovery'
import { UserSessionProvider } from '@modulus-learning/host-tanstack-start/modules/app/session/provider'
import { getUserSessionFn } from '@modulus-learning/host-tanstack-start/modules/app/session/session-state'
import { AppBarFront } from '@modulus-learning/host-tanstack-start/ui/components/app-bar-front/index'
import { SiteFooter } from '@modulus-learning/host-tanstack-start/ui/components/site-footer'

/** Forms layout (`/sign-in`, `/sign-up`, `/start-activity/…`). */
export const Route = createFileRoute('/$lng/_forms')({
  staticData: { themeContext: 'public' },
  loader: () => getUserSessionFn(),
  head: ({ matches }) => pageHead({}, matches),
  component: function FormsLayout() {
    const { lng } = Route.useParams()
    const { session, renewable } = Route.useLoaderData()
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
  },
})
