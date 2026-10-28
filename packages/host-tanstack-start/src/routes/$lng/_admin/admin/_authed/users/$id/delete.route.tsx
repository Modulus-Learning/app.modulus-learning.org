import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getUser } from '@/modules/admin/users/get'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { id, lng } = params
      const data = await getUser(id, lng)

      if (data?.user == null) throw notFound()
      return { data: { ...data, user: data.user } }
    },
    component: lazyRouteComponent(() => import('./delete.page'), 'Page'),
  })
  return Route
}
