import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getProgress } from '@/modules/app/activities/get-progress'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: ({ params }) => getProgress((params as RouteParams).id),
    head: ({ matches, params }) =>
      pageHead(
        {
          title: 'Completion',
          path: `/dashboard/activity-code/${(params as RouteParams).id}/completion`,
        },
        matches
      ),
    component: lazyRouteComponent(() => import('./completion.page'), 'Page'),
  })
  return Route
}
