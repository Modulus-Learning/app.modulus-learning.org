import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AdminRoleCreateForm } from '@/modules/admin/admin-roles/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Add Admin Role',
    path: '/admin/admin-roles/add',
  })
}

export default async function AddRolePage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

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
              { label: 'Add Admin Role', href: '/admin/admin-roles/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <AdminRoleCreateForm lng={lng} />
        </Container>
      </Section>
    </>
  )
}
