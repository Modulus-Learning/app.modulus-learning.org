import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { RolesListView } from '@/modules/admin/roles/components/list-view'
import { listRoles } from '@/modules/admin/roles/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Roles',
    path: '/admin/roles',
  })
}

export default async function RolesPage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

  const data = await listRoles(lng)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'Roles', href: '/admin/roles' }]}
          />
        </Container>
      </Section>
      <RolesListView lng={lng} data={data} />
    </>
  )
}
