import { createFileRoute } from '@tanstack/react-router'

import { SessionBootstrap } from '@modulus-learning/host-tanstack-start/lib/session/session-bootstrap'
import { z } from 'zod'

// Admin-session renewal bootstrap (spec: Authentication And Sessions, item 5).
export const Route = createFileRoute('/$lng/_admin/admin/renew')({
  staticData: { chrome: 'chromeless' },
  validateSearch: z.object({ return: z.string().optional() }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: function AdminRenew() {
    const search = Route.useSearch()
    return <SessionBootstrap domain="admin" returnParam={search.return ?? null} />
  },
})
