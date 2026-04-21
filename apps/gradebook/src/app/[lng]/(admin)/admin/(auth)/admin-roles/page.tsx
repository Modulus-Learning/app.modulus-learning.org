import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AdminRolesListView } from '@/modules/admin/admin-roles/components/list-view'
import { listAdminRoles } from '@/modules/admin/admin-roles/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Admin Roles',
    path: '/admin/admin-roles',
  })
}

export default async function AdminRolesPage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

  const data = await listAdminRoles(lng)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'Admin Roles', href: '/admin/admin-roles' }]}
          />
        </Container>
      </Section>
      <AdminRolesListView lng={lng} data={data} />
    </>
  )
}
