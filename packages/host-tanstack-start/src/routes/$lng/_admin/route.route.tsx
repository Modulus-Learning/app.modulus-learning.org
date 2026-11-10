import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { getAdminSessionFn } from '@/modules/admin/session/session-state'

/**
 * The admin surface's pathless layout. The server entry 404s it on a
 * `frontend` instance, and its server functions carry the admin surface gate.
 * Provides the verification-only admin session to the sign-in page and the
 * authenticated area (`admin/_authed`).
 */
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    staticData: { themeContext: 'protected' },
    loader: () => getAdminSessionFn(),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
