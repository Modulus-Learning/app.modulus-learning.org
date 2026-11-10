import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { getAllowlistRule } from '@/modules/admin/activity-url-allowlist/get'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const { id, lng } = params as RouteParams
      const data = await getAllowlistRule(id, lng)

      if (data?.rule == null) throw notFound()
      return { data: { ...data, rule: data.rule } }
    },
    component: lazyRouteComponent(() => import('./edit.page'), 'Page'),
  })
  return Route
}
