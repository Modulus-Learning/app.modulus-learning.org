import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

// Admin-session renewal bootstrap (spec: Authentication And Sessions, item 5).
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { chrome: 'chromeless' },
    validateSearch: z.object({ return: z.string().optional() }),
    head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
    component: lazyRouteComponent(() => import('./renew.page'), 'Page'),
  })
  return Route
}
