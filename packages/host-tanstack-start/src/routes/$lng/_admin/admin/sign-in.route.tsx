import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'

// Admin sign-in. Deliberately outside `_authed`, so it is never itself
// redirected (the Next `withAdminAuth` matched only an unprefixed
// `/admin/sign-in`, which looped for `/es/admin/sign-in`).
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    head: ({ matches }) => pageHead({ title: 'Admin Sign In', path: '/admin/sign-in' }, matches),
    component: lazyRouteComponent(() => import('./sign-in.page'), 'Page'),
  })
  return Route
}
