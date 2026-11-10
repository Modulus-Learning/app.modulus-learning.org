import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminRolesListView } from '@/modules/admin/admin-roles/components/list-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
