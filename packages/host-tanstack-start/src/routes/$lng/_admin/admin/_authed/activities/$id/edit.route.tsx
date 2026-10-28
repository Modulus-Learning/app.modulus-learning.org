import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getAllowlistRule } from '@/modules/admin/activity-url-allowlist/get'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { id, lng } = params
      const data = await getAllowlistRule(id, lng)

      if (data?.rule == null) throw notFound()
      return { data: { ...data, rule: data.rule } }
    },
    component: lazyRouteComponent(() => import('./edit.page'), 'Page'),
  })
  return Route
}
