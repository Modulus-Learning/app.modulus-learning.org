import { createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'

import { SessionBootstrap } from '@/lib/session/session-bootstrap'

// Admin-session renewal bootstrap (spec: Authentication And Sessions, item 5).
// Moves under the `$lng` admin tree with the rest of the admin surface (Task 14).
export const Route = createFileRoute('/admin/renew')({
  validateSearch: z.object({ return: z.string().optional() }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: function AdminRenew() {
    const search = Route.useSearch()
    return <SessionBootstrap domain="admin" returnParam={search.return ?? null} />
  },
})
