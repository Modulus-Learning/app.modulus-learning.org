import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

/**
 * `/lti/error?code=<slug>`. The search schema admits only the known slugs:
 * TanStack Router serialises validated search into the page's dehydrated
 * state, so dropping anything else here keeps a rejected value out of the
 * HTML entirely (the Next page always carried it in its RSC payload).
 */
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    validateSearch: z.object({
      code: z
        .enum(['invalid_request', 'invalid_launch', 'session_expired', 'server_error'])
        .optional()
        .catch(undefined),
    }),
    component: lazyRouteComponent(() => import('./error.page'), 'Page'),
  })
  return Route
}
