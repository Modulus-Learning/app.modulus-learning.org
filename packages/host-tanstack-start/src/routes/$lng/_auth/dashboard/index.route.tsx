import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getActivityCodes } from '@/modules/app/activities/get-activity-codes'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: () => getActivityCodes(),
    head: ({ matches }) => pageHead({ title: 'Activity Codes', path: '/dashboard' }, matches),
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
