import { createFileRoute, type FileRoutesByPath, lazyRouteComponent } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'

// Admin sign-in. Deliberately outside `_authed`, so it is never itself
// redirected (the Next `withAdminAuth` matched only an unprefixed
// `/admin/sign-in`, which looped for `/es/admin/sign-in`).
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    head: ({ matches }) => pageHead({ title: 'Admin Sign In', path: '/admin/sign-in' }, matches),
    component: lazyRouteComponent(() => import('./sign-in.page'), 'Page'),
  })
  return Route
}
