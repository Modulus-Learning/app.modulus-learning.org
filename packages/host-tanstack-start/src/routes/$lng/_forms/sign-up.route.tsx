import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    head: ({ matches }) => pageHead({ title: 'Sign Up', path: '/sign-up' }, matches),
    component: lazyRouteComponent(() => import('./sign-up.page'), 'Page'),
  })
  return Route
}
