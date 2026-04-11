import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { UserDetailsView } from '@/modules/admin/users/components/details-view'
import { getUser } from '@/modules/admin/users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Delete User',
    path: '/admin/users/id/delete',
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
  const data = await getUser(id, lng)

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
              { label: 'Users', href: '/admin/users' },
              { label: 'User', href: `/admin/users/${data?.user?.id}` },
              { label: 'Delete', href: `/admin/users/${data?.user?.id}/delete` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.user?.full_name}</h1>
          <UserDetailsView lng={lng} data={data} mode="delete" />
        </Container>
      </Section>
    </>
  )
}
