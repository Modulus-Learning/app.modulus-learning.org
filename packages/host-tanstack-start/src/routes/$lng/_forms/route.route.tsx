import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getUserSessionFn } from '@/modules/app/session/session-state'

/** Forms layout (`/sign-in`, `/sign-up`, `/start-activity/…`). */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { themeContext: 'public' },
    loader: () => getUserSessionFn(),
    head: ({ matches }) => pageHead({}, matches),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
