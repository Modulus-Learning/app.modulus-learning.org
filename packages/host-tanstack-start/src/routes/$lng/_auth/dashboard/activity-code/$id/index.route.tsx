import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getActivityCode } from '@/modules/app/activities/get-activity-code'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const data = await getActivityCode((params as RouteParams).id)
      if (data?.activity_code == null) throw notFound()
      return { activityCode: data.activity_code }
    },
    head: ({ matches, params }) =>
      pageHead(
        { title: 'Activity Code', path: `/dashboard/activity-code/${(params as RouteParams).id}` },
        matches
      ),
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
