import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getRole } from '@/modules/admin/roles/get'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { id, lng } = params
      const data = await getRole(id, lng)

      if (data?.role == null) throw notFound()
      return { data: { ...data, role: data.role } }
    },
    component: lazyRouteComponent(() => import('./delete.page'), 'Page'),
  })
  return Route
}
