import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    head: ({ matches }) => pageHead({ title: 'Sign Up', path: '/sign-up' }, matches),
    component: lazyRouteComponent(() => import('./sign-up.page'), 'Page'),
  })
  return Route
}
