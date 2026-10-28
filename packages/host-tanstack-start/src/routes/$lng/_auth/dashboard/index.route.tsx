import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getActivityCodes } from '@/modules/app/activities/get-activity-codes'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    loader: () => getActivityCodes(),
    head: ({ matches }) => pageHead({ title: 'Activity Codes', path: '/dashboard' }, matches),
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
