import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { addAdminUser } from '@/modules/admin/admin-users/add'
import { AdminUserCreateForm } from '@/modules/admin/admin-users/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Add Admin User',
    path: '/admin/admin-users/add',
  })
}

export default async function AddUserPage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  const data = await addAdminUser(lng)

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
              { label: 'Add Admin User', href: '/admin/admin-users/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <AdminUserCreateForm lng={lng} roles={data?.included?.roles} />
        </Container>
      </Section>
    </>
  )
}
