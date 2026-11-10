import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { getAdminUser } from '@/modules/admin/admin-users/get'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const { id, lng } = params as RouteParams
      const data = await getAdminUser(id, lng)

      if (data?.user == null) throw notFound()
      return { data: { ...data, user: data.user } }
    },
    component: lazyRouteComponent(() => import('./edit.page'), 'Page'),
  })
  return Route
}
