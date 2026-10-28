import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { listRoles } from '@/modules/admin/roles/list'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { lng } = params

      const data = await listRoles(lng)
      return { data }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
