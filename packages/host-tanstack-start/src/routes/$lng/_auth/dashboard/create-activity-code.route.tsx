import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    head: ({ matches }) =>
      pageHead({ title: 'Create Activity Code', path: '/dashboard/create-activity-code' }, matches),
    component: lazyRouteComponent(() => import('./create-activity-code.page'), 'Page'),
  })
  return Route
}
