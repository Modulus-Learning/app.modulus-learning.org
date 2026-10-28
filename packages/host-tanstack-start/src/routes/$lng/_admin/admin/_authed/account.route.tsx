import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getAccount } from '@/modules/admin/account/get-account'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { lng } = params

      const data = await getAccount(lng)
      if (data?.user == null) throw notFound()
      return { data: { ...data, user: data.user } }
    },
    component: lazyRouteComponent(() => import('./account.page'), 'Page'),
  })
  return Route
}
