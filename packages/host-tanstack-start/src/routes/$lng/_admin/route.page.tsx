import { Outlet, useLoaderData } from '@tanstack/react-router'

import { SessionIdentity } from '@/lib/session/session-identity'
import { AdminSessionProvider } from '@/modules/admin/session/provider'

export const Page = function AdminRootLayout() {
  const { session } = useLoaderData({ strict: false })
  return (
    <AdminSessionProvider session={session}>
      <SessionIdentity domain="admin" userId={session?.user.id ?? null} />
      <Outlet />
    </AdminSessionProvider>
  )
}
