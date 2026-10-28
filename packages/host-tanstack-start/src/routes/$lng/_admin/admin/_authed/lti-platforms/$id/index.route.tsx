import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { getLtiPlatform } from '@/modules/admin/lti-platforms/get'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: async ({ params }) => {
      const { id, lng } = params
      const data = await getLtiPlatform(id, lng)

      if (data?.platform == null) throw notFound()
      return { data: { ...data, platform: data.platform } }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
