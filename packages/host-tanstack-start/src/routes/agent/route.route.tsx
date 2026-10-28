import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

// Chromeless agent pages (the agent authorization error page).
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { chrome: 'chromeless' },
    head: () => ({ meta: [{ title: 'Modulus' }] }),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
