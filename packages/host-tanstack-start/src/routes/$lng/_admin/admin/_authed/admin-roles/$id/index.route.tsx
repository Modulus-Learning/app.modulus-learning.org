import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { getAdminRole } from '@/modules/admin/admin-roles/get'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const { id, lng } = params as RouteParams
      const data = await getAdminRole(id, lng)

      if (data?.role == null) throw notFound()
      return { data: { ...data, role: data.role } }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
