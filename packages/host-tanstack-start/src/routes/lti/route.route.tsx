import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

// Chromeless LTI pages (spec: Task 13), served in English and always light.
// The server entry's deployment-mode gate covers every request here.
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    staticData: { chrome: 'chromeless' },
    head: () => ({
      meta: [{ title: 'Modulus' }, { name: 'description', content: 'Modulus Learning Platform' }],
    }),
    component: lazyRouteComponent(() => import('./route.page'), 'Page'),
  })
  return Route
}
