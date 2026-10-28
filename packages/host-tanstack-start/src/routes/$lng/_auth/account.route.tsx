import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { getAccount } from '@/modules/app/account/get-account'
import type { Locale } from '@/i18n/i18n-config'
import type { RouteParams } from '@/lib/route-params'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    loader: async ({ params }) => {
      const data = await getAccount((params as RouteParams).lng as Locale)
      if (data?.user == null) throw notFound()
      return { user: data.user }
    },
    head: ({ matches }) => pageHead({ title: 'Account', path: '/account' }, matches),
    component: lazyRouteComponent(() => import('./account.page'), 'Page'),
  })
  return Route
}
