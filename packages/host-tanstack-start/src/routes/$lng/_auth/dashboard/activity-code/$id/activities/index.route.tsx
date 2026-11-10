import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { keepSearch } from '@/lib/search-params'
import { getActivities } from '@/modules/app/activities/get-activities'
import { LIST_SEARCH_KEYS } from '@/modules/app/activities/list-views'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // Search and sort apply to the loaded rows on the page, so the loader takes
    // no search values; `keepSearch` keeps them unquoted in the URL.
    validateSearch: keepSearch(LIST_SEARCH_KEYS),
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
