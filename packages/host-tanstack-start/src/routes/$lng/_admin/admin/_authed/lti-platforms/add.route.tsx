import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    component: lazyRouteComponent(() => import('./add.page'), 'Page'),
  })
  return Route
}
