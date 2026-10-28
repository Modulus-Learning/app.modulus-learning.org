import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getUserSessionFn } from '@/modules/app/session/session-state'

/** Forms layout (`/sign-in`, `/sign-up`, `/start-activity/…`). */
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    staticData: { themeContext: 'public' },
    loader: () => getUserSessionFn(),
    head: ({ matches }) => pageHead({}, matches),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
