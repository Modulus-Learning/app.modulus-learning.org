import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { validateSearchParamsSchema } from '@/modules/admin/users/@types/index'
import { listUsers } from '@/modules/admin/users/list'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    // Search values stay strings, as the Next page received them; the page's own
    // schema decides validity (an invalid query is a 404, as before).
    validateSearch: (search: Record<string, unknown>): Record<string, string> =>
      Object.fromEntries(Object.entries(search).map(([key, value]) => [key, String(value)])),
    loaderDeps: ({ search }) => search,
    loader: async ({ params, deps }) => {
      const { lng } = params

      const validateResult = validateSearchParamsSchema.safeParse(deps)
      if (!validateResult.success) {
        throw notFound()
      }

      const data = await listUsers(lng, validateResult.data)
      return { data }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
