import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AdminRoleEditForm } from '@/modules/admin/admin-roles/components/edit-form'
import { getAdminRole } from '@/modules/admin/admin-roles/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Admin Role',
    path: '/admin/admin-roles/id',
  })
}

export default async function RolePage({
  params,
}: {
  params: Promise<{
    id: string
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { id, lng } = await params
  const data = await getAdminRole(id, lng)

  if (data?.role === null) notFound()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'Admin Roles', href: '/admin/admin-roles' },
              { label: 'Admin Role', href: `/admin/admin-roles/${data?.role.id}` },
              { label: 'Edit', href: `/admin/admin-roles/${data?.role.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.role.name}</h1>
          <AdminRoleEditForm lng={lng} data={data} />
        </Container>
      </Section>
    </>
  )
}
