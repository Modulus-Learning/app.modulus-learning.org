import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { addUser } from '@/modules/admin/users/add'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const { lng } = params as RouteParams
      const data = await addUser(lng)
      return { data }
    },
    component: lazyRouteComponent(() => import('./add.page'), 'Page'),
  })
  return Route
}
