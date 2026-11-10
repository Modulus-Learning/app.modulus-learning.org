import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { keepSearch, searchAsStrings } from '@/lib/search-params'
import { validateSearchParamsSchema } from '@/modules/admin/admin-users/@types/index'
import { listAdminUsers } from '@/modules/admin/admin-users/list'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // The loader receives string values, as the Next page did; the page's own
    // schema decides validity (an invalid query is a 404, as before). See
    // `@/lib/search-params` for why the conversion is not in `validateSearch`.
    validateSearch: keepSearch(),
    loaderDeps: ({ search }) => searchAsStrings(search),
    loader: async ({ params, deps }) => {
      const { lng } = params as RouteParams

      const validateResult = validateSearchParamsSchema.safeParse(deps)
      if (!validateResult.success) {
        throw notFound()
      }

      const data = await listAdminUsers(lng, validateResult.data)
      return { data }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
