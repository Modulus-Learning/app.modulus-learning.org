import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router'

import { validateSearchParamsSchema } from '@/modules/admin/dashboard/@types/index'
import { getMonthlyActiveUsers } from '@/modules/admin/dashboard/getMonthlyActiveUsers'
import { getNewVsReturningUsers } from '@/modules/admin/dashboard/getNewVsReturningUser'
import { getRegistrationsPerDay } from '@/modules/admin/dashboard/getRegistrationsPerDay'
import { getRegistrationsPerMonth } from '@/modules/admin/dashboard/getRegistrationsPerMonth'
import { getTotalRegisteredUsers } from '@/modules/admin/dashboard/getTotalRegisteredUsers'

export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    // Search values stay strings, as the Next page received them; the page's own
    // schema decides validity (an invalid query is a 404, as before).
    validateSearch: (search: Record<string, unknown>): Record<string, string> =>
      Object.fromEntries(Object.entries(search).map(([key, value]) => [key, String(value)])),
    loaderDeps: ({ search }) => search,
    loader: async ({ deps }) => {
      const validateResult = validateSearchParamsSchema.safeParse(deps)
      if (validateResult.success === false) {
        throw notFound()
      }

      const { year, month } = validateResult.data

      const [
        totalRegisteredUsers,
        monthlyActiveUsers,
        registrationsPerDay,
        registrationsPerMonth,
        newVsReturningUsers,
      ] = await Promise.all([
        getTotalRegisteredUsers(),
        getMonthlyActiveUsers(year),
        getRegistrationsPerDay(year, month),
        getRegistrationsPerMonth(year),
        getNewVsReturningUsers(year),
      ])
      return {
        totalRegisteredUsers,
        monthlyActiveUsers,
        registrationsPerDay,
        registrationsPerMonth,
        newVsReturningUsers,
      }
    },
    component: lazyRouteComponent(() => import('./index.page'), 'Page'),
  })
  return Route
}
