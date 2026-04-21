import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AdminUserDetailsView } from '@/modules/admin/admin-users/components/details-view'
import { getAdminUser } from '@/modules/admin/admin-users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Delete Admin User',
    path: '/admin/admin-users/id/delete',
  })
}

export default async function UserDeletePage({
  params,
}: {
  params: Promise<{
    id: string
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { id, lng } = await params
  const data = await getAdminUser(id, lng)

  if (data?.user === null) notFound()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'Admin Users', href: '/admin/admin-users' },
              { label: 'Admin User', href: `/admin/admin-users/${data?.user?.id}` },
              { label: 'Delete', href: `/admin/admin-users/${data?.user?.id}/delete` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>
            {data?.user?.given_name} {data?.user?.family_name}
          </h1>
          <AdminUserDetailsView lng={lng} data={data} mode="delete" />
        </Container>
      </Section>
    </>
  )
}
