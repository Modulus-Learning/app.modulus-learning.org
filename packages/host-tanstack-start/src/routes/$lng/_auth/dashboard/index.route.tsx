import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { keepSearch } from '@/lib/search-params'
import { getActivityCodes } from '@/modules/app/activities/get-activity-codes'
import { LIST_SEARCH_KEYS } from '@/modules/app/activities/list-views'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // Search and sort apply to the loaded rows on the page, so the loader takes
    // no search values; `keepSearch` keeps them unquoted in the URL.
    validateSearch: keepSearch(LIST_SEARCH_KEYS),
    loader: () => getActivityCodes(),
    head: ({ matches }) => pageHead({ title: 'Activity Codes', path: '/dashboard' }, matches),
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
