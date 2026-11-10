import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { keepSearch, searchAsStrings } from '@/lib/search-params'
import { validateSearchParamsSchema } from '@/modules/app/activities/@types/index'
import { getProgress } from '@/modules/app/activities/get-progress'
import type { RouteParams } from '@/lib/route-params'

const LEARNERS_SEARCH_KEYS = ['page', 'page_size', 'desc', 'order', 'query', 'role'] as const

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // The loader receives string values, as the Next page did; the shared
    // schema decides validity and an invalid query is a 404, as before. See
    // `@/lib/search-params` for why the conversion is not in `validateSearch`.
    validateSearch: keepSearch(LEARNERS_SEARCH_KEYS),
    loaderDeps: ({ search }) => searchAsStrings(search),
    loader: async ({ params, deps }) => {
      if (!validateSearchParamsSchema.safeParse(deps).success) throw notFound()
      return getProgress((params as RouteParams).id, deps)
    },
    head: ({ matches, params }) =>
      pageHead(
        {
          title: 'Learners',
          path: `/dashboard/activity-code/${(params as RouteParams).id}/learners`,
        },
        matches
      ),
    component: lazyRouteComponent(() => import('./learners.page'), 'Page'),
  })
  return Route
}
