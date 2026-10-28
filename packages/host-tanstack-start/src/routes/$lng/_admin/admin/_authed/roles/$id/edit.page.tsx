import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RoleEditForm } from '@/modules/admin/roles/components/edit-form'
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
              { label: 'Role', href: `/admin/roles/${data?.role?.id}` },
              { label: 'Edit', href: `/admin/roles/${data?.role?.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.role?.name}</h1>
          <RoleEditForm lng={lng} data={data} />
        </Container>
      </Section>
    </>
  )
}
