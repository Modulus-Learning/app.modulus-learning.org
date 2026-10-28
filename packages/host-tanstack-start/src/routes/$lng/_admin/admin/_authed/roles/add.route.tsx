import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    component: lazyRouteComponent(() => import('./add.page'), 'Page'),
  })
  return Route
}
