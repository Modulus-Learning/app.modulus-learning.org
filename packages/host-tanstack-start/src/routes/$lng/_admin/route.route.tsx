import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { getAdminSessionFn } from '@/modules/admin/session/session-state'

/**
 * The admin surface's pathless layout. The server entry 404s it on a
 * `frontend` instance, and its server functions carry the admin surface gate.
 * Provides the verification-only admin session to the sign-in page and the
 * authenticated area (`admin/_authed`).
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { themeContext: 'protected' },
    loader: () => getAdminSessionFn(),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
