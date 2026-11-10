import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  notFound,
} from '@tanstack/react-router'

import { keepSearch, searchAsStrings } from '@/lib/search-params'
import { validateSearchParamsSchema } from '@/modules/admin/dashboard/@types/index'
import { getMonthlyActiveUsers } from '@/modules/admin/dashboard/getMonthlyActiveUsers'
import { getNewVsReturningUsers } from '@/modules/admin/dashboard/getNewVsReturningUser'
import { getRegistrationsPerDay } from '@/modules/admin/dashboard/getRegistrationsPerDay'
import { getRegistrationsPerMonth } from '@/modules/admin/dashboard/getRegistrationsPerMonth'
import { getTotalRegisteredUsers } from '@/modules/admin/dashboard/getTotalRegisteredUsers'

export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
    // The loader receives string values, as the Next page did; the page's own
    // schema decides validity (an invalid query is a 404, as before). See
    // `@/lib/search-params` for why the conversion is not in `validateSearch`.
    validateSearch: keepSearch(),
    loaderDeps: ({ search }) => searchAsStrings(search),
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
