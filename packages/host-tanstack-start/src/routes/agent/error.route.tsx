import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

/**
 * `/agent/error?code=<slug>`. The search schema admits only the known slugs:
 * TanStack Router serialises validated search into the page's dehydrated
 * state, so dropping anything else here keeps a rejected value out of the
 * HTML entirely (the Next page always carried it in its RSC payload).
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    validateSearch: z.object({
      code: z.enum(['invalid_request', 'server_error']).optional().catch(undefined),
    }),
    component: lazyRouteComponent(() => import('./error.page'), 'Page'),
  })
  return Route
}
