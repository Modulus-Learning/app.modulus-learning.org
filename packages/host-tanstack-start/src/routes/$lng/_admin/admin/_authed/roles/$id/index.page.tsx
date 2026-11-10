import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RoleDetailsView } from '@/modules/admin/roles/components/details-view'
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
              { label: 'Roles', href: '/admin/roles' },
              { label: 'Role', href: '/admin/roles/id' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.role?.name}</h1>
          <RoleDetailsView lng={lng} data={data} mode="view" />
        </Container>
      </Section>
    </>
  )
}
