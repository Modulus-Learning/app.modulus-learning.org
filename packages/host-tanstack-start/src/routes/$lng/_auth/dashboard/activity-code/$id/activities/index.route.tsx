import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getActivities } from '@/modules/app/activities/get-activities'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const data = await getActivities((params as RouteParams).id)
      if (data?.activity_code == null || data.activities == null) throw notFound()
      return { activityCode: data.activity_code, activities: data.activities }
    },
    head: ({ matches, params }) =>
      pageHead(
        {
          title: 'Activities',
          path: `/dashboard/activity-code/${(params as RouteParams).id}/activities`,
        },
        matches
      ),
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
