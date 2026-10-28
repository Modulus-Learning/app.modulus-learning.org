import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

// Chromeless LTI pages (spec: Task 13), served in English and always light.
// The server entry's deployment-mode gate covers every request here.
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    staticData: { chrome: 'chromeless' },
    head: () => ({
      meta: [{ title: 'Modulus' }, { name: 'description', content: 'Modulus Learning Platform' }],
    }),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
