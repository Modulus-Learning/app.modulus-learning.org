import { createFileRoute } from '@tanstack/react-router'

import { z } from 'zod'

import { LtiErrorView } from '@/modules/lti/components/lti-error-view'

/**
 * `/lti/error?code=<slug>`. The search schema admits only the known slugs:
 * TanStack Router serialises validated search into the page's dehydrated
 * state, so dropping anything else here keeps a rejected value out of the
 * HTML entirely (the Next page always carried it in its RSC payload).
 */
export const Route = createFileRoute('/lti/error')({
  validateSearch: z.object({
    code: z
      .enum(['invalid_request', 'invalid_launch', 'session_expired', 'server_error'])
      .optional()
      .catch(undefined),
  }),
  component: function ErrorPage() {
    const { code } = Route.useSearch()
    return <LtiErrorView code={code} />
  },
})
