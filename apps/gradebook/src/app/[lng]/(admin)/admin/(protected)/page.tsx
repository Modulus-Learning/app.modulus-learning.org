import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { validateSearchParamsSchema } from '@/modules/admin/dashboard/@types'
import { MonthlyActiveUsersView } from '@/modules/admin/dashboard/components/MonthlyActiveUsersView'
import { NewVsReturningUsersView } from '@/modules/admin/dashboard/components/NewVsReturningUsersView'
import { RegistrationsPerDayView } from '@/modules/admin/dashboard/components/RegistrationsPerDayView'
import { RegistrationsPerMonthView } from '@/modules/admin/dashboard/components/RegistrationsPerMonthView'
import { getMonthlyActiveUsers } from '@/modules/admin/dashboard/getMonthlyActiveUsers'
import { getNewVsReturningUsers } from '@/modules/admin/dashboard/getNewVsReturningUser'
import { getRegistrationsPerDay } from '@/modules/admin/dashboard/getRegistrationsPerDay'
import { getRegistrationsPerMonth } from '@/modules/admin/dashboard/getRegistrationsPerMonth'
import { getTotalRegisteredUsers } from '@/modules/admin/dashboard/getTotalRegisteredUsers'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { createQueryString } from '@/utils/utils.framework'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lng: Locale }>
  searchParams: Promise<{
    order?: string
    query?: string
    page?: string
  }>
}): Promise<Metadata> {
  const { lng } = await params
  const qs = await searchParams
  const _queryString = createQueryString(qs)
  return await getMeta(lng, {
    title: 'Dashboard',
    path: '/admin',
  })
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{
    lng: Locale
  }>
  searchParams: Promise<{
    year?: string
    month?: string
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  const queryString = await searchParams

  const validateResult = validateSearchParamsSchema.safeParse(queryString)
  if (validateResult.success === false) {
    notFound()
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
