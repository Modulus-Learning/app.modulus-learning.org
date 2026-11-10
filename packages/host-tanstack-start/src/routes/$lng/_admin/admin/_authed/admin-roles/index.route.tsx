import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { listAdminRoles } from '@/modules/admin/admin-roles/list'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const { lng } = params as RouteParams

      const data = await listAdminRoles(lng)
      return { data }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
