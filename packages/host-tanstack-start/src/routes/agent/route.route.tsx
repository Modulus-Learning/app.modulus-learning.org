import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

// Chromeless agent pages (the agent authorization error page).
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    staticData: { chrome: 'chromeless' },
    head: () => ({ meta: [{ title: 'Modulus' }] }),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
