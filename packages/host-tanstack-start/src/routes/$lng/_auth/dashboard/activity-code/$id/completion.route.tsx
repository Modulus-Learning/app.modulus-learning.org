import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getProgress } from '@/modules/app/activities/get-progress'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
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
