import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { validateSearchParamsSchema } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/@types/index'
import { MonthlyActiveUsersView } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/components/MonthlyActiveUsersView'
import { NewVsReturningUsersView } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/components/NewVsReturningUsersView'
import { RegistrationsPerDayView } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/components/RegistrationsPerDayView'
import { RegistrationsPerMonthView } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/components/RegistrationsPerMonthView'
import { getMonthlyActiveUsers } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/getMonthlyActiveUsers'
import { getNewVsReturningUsers } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/getNewVsReturningUser'
import { getRegistrationsPerDay } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/getRegistrationsPerDay'
import { getRegistrationsPerMonth } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/getRegistrationsPerMonth'
import { getTotalRegisteredUsers } from '@modulus-learning/host-tanstack-start/modules/admin/dashboard/getTotalRegisteredUsers'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/')({
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
  component: function Page() {
    const {
      totalRegisteredUsers,
      monthlyActiveUsers,
      registrationsPerDay,
      registrationsPerMonth,
      newVsReturningUsers,
    } = Route.useLoaderData()
    const { lng } = Route.useParams()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              homeLabel="Admin"
              homePath="/admin"
              lng={lng}
              breadcrumbs={[{ label: 'Dashboard', href: '/admin' }]}
            />
          </Container>
        </Section>

        <Section className="py-2 pb-2">
          <Container>
            <div className="stats pl-2 mb-4">
              <p>Total Registered Users</p>
              <h2>{totalRegisteredUsers.total}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RegistrationsPerDayView lng={lng} result={registrationsPerDay} />
              <RegistrationsPerMonthView lng={lng} result={registrationsPerMonth} />
              <MonthlyActiveUsersView lng={lng} result={monthlyActiveUsers} />
              <NewVsReturningUsersView lng={lng} result={newVsReturningUsers} />
            </div>
          </Container>
        </Section>
      </>
    )
  },
})
