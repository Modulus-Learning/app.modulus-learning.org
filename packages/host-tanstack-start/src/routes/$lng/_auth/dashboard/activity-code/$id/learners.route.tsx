import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { validateSearchParamsSchema } from '@/modules/app/activities/@types/index'
import { getProgress } from '@/modules/app/activities/get-progress'
import type { RouteParams } from '@/lib/route-params'

type LearnersSearch = {
  page?: string
  desc?: string
  order?: string
  query?: string
  role?: string
}

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    // Search values stay strings, as the Next page received them; the shared
    // schema decides validity and an invalid query is a 404, as before.
    validateSearch: (search: Record<string, unknown>): LearnersSearch =>
      Object.fromEntries(
        Object.entries(search)
          .filter(([key]) => ['page', 'desc', 'order', 'query', 'role'].includes(key))
          .map(([key, value]) => [key, String(value)])
      ),
    loaderDeps: ({ search }) => search,
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
