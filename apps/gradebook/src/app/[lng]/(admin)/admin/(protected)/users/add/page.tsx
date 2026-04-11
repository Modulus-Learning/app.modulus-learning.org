import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { addUser } from '@/modules/admin/users/add'
import { UserCreateForm } from '@/modules/admin/users/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Users',
    path: '/admin/users/add',
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
  const data = await addUser(lng)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'Users', href: '/admin/users' },
              { label: 'Add User', href: '/admin/users/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <UserCreateForm lng={lng} roles={data?.included?.roles} />
        </Container>
      </Section>
    </>
  )
}
