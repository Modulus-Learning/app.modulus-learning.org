import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

// Learner-session renewal bootstrap (spec: Authentication And Sessions, item 5).
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    staticData: { chrome: 'chromeless' },
    validateSearch: z.object({ return: z.string().optional() }),
    head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
    component: lazyRouteComponent(() => import('./renew.page'), 'Page'),
  })
  return Route
}
