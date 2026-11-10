import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminRoleDetailsView } from '@/modules/admin/admin-roles/components/details-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
              { label: 'Delete', href: `/admin/admin-roles/${data?.role.id}/delete` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.role.name}</h1>
          <AdminRoleDetailsView lng={lng} data={data} mode="delete" />
        </Container>
      </Section>
    </>
  )
}
