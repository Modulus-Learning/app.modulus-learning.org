import { createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'

import { AgentErrorView } from '@/modules/agent/components/agent-error-view'

/**
 * `/agent/error?code=<slug>`. The search schema admits only the known slugs:
 * TanStack Router serialises validated search into the page's dehydrated
 * state, so dropping anything else here keeps a rejected value out of the
 * HTML entirely (the Next page always carried it in its RSC payload).
 */
export const Route = createFileRoute('/agent/error')({
  validateSearch: z.object({
    code: z.enum(['invalid_request', 'server_error']).optional().catch(undefined),
  }),
  component: function ErrorPage() {
    const { code } = Route.useSearch()
    return <AgentErrorView code={code} />
  },
})
