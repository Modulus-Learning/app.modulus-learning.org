import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getAdminUser } from '@/modules/admin/admin-users/get'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { id, lng } = params
      const data = await getAdminUser(id, lng)

      if (data?.user == null) throw notFound()
      return { data: { ...data, user: data.user } }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
