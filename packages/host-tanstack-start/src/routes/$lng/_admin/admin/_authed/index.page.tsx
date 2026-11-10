import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { MonthlyActiveUsersView } from '@/modules/admin/dashboard/components/MonthlyActiveUsersView'
import { NewVsReturningUsersView } from '@/modules/admin/dashboard/components/NewVsReturningUsersView'
import { RegistrationsPerDayView } from '@/modules/admin/dashboard/components/RegistrationsPerDayView'
import { RegistrationsPerMonthView } from '@/modules/admin/dashboard/components/RegistrationsPerMonthView'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const {
    totalRegisteredUsers,
    monthlyActiveUsers,
    registrationsPerDay,
    registrationsPerMonth,
    newVsReturningUsers,
  } = useLoaderData({ strict: false })
  const { lng } = useParams({ strict: false })
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
}
