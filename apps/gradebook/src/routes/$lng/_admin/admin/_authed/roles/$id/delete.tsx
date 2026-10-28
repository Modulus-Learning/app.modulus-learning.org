import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { RoleDetailsView } from '@modulus-learning/host-tanstack-start/modules/admin/roles/components/details-view'
import { getRole } from '@modulus-learning/host-tanstack-start/modules/admin/roles/get'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/roles/$id/delete')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getRole(id, lng)

    if (data?.role == null) throw notFound()
    return { data: { ...data, role: data.role } }
  },
  component: function Page() {
    const { id, lng } = Route.useParams()
    const { data } = Route.useLoaderData()
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
                { label: 'Delete', href: `/admin/roles/${data?.role?.id}/delete` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>{data?.role?.name}</h1>
            <RoleDetailsView lng={lng} data={data} mode="delete" />
          </Container>
        </Section>
      </>
    )
  },
})
