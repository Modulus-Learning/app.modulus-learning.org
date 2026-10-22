import { createFileRoute, Outlet } from '@tanstack/react-router'

import { SessionIdentity } from '@/lib/session/session-identity'
import { AdminSessionProvider } from '@/modules/admin/session/provider'
import { getAdminSessionFn } from '@/modules/admin/session/session-state'

/**
 * The admin surface's pathless layout. The server entry 404s it on a
 * `frontend` instance, and its server functions carry the admin surface gate.
 * Provides the verification-only admin session to the sign-in page and the
 * authenticated area (`admin/_authed`).
 */
export const Route = createFileRoute('/$lng/_admin')({
  staticData: { themeContext: 'protected' },
  loader: () => getAdminSessionFn(),
  component: function AdminRootLayout() {
    const { session } = Route.useLoaderData()
    return (
      <AdminSessionProvider session={session}>
        <SessionIdentity domain="admin" userId={session?.user.id ?? null} />
        <Outlet />
      </AdminSessionProvider>
    )
  },
})
