import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getActivities } from '@/modules/app/activities/get-activities'
import { listActivityCodeMembers } from '@/modules/app/activities/list-activity-code-members'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const [data, { members }] = await Promise.all([
        getActivities((params as RouteParams).id),
        listActivityCodeMembers((params as RouteParams).id),
      ])
      if (data?.activity_code == null || data.activities == null) throw notFound()
      return { activityCode: data.activity_code, activities: data.activities, members }
    },
    head: ({ matches, params }) =>
      pageHead(
        {
          title: 'Edit Activities',
          path: `/dashboard/activity-code/${(params as RouteParams).id}/activities/edit`,
        },
        matches
      ),
    component: lazyRouteComponent(() => import('./edit.page'), 'Page'),
  })
  return Route
}
