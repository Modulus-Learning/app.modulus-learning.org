import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { validateSearchParamsSchema } from '@/modules/admin/admin-users/@types'
import { AdminUsersListView } from '@/modules/admin/admin-users/components/list-view'
import { listAdminUsers } from '@/modules/admin/admin-users/list'
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
  const queryString = createQueryString(qs)
  return await getMeta(lng, {
    title: 'Admin Users',
    path: `/admin/admin-users${queryString != null && queryString.length > 0 ? `?${queryString}` : ''}`,
  })
}

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{
    lng: Locale
  }>
  searchParams: Promise<{
    page?: string
    desc?: string
    order?: string
    query?: string
    role?: string
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  const queryString = await searchParams

  const validateResult = validateSearchParamsSchema.safeParse(queryString)
  if (!validateResult.success) {
    notFound()
  }

  const data = await listAdminUsers(lng, validateResult.data)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'Admin Users', href: '/admin/admin-users' }]}
          />
        </Container>
      </Section>
      <AdminUsersListView lng={lng} data={data} />
    </>
  )
}
