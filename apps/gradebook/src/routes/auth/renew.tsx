import { createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'

import { SessionBootstrap } from '@/lib/session/session-bootstrap'

// Learner-session renewal bootstrap (spec: Authentication And Sessions, item 5).
export const Route = createFileRoute('/auth/renew')({
  validateSearch: z.object({ return: z.string().optional() }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: function UserRenew() {
    const search = Route.useSearch()
    return <SessionBootstrap domain="user" returnParam={search.return ?? null} />
  },
})
