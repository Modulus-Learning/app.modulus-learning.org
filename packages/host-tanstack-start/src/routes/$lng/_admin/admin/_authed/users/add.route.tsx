import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { addUser } from '@/modules/admin/users/add'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { lng } = params
      const data = await addUser(lng)
      return { data }
    },
    component: lazyRouteComponent(() => import('./add.page'), 'Page'),
  })
  return Route
}
