import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { AdminRoleEditForm } from '@modulus-learning/host-tanstack-start/modules/admin/admin-roles/components/edit-form'
import { getAdminRole } from '@modulus-learning/host-tanstack-start/modules/admin/admin-roles/get'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-roles/$id/edit')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getAdminRole(id, lng)

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
                { label: 'Admin Roles', href: '/admin/admin-roles' },
                { label: 'Admin Role', href: `/admin/admin-roles/${data?.role.id}` },
                { label: 'Edit', href: `/admin/admin-roles/${data?.role.id}/edit` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>{data?.role.name}</h1>
            <AdminRoleEditForm lng={lng} data={data} />
          </Container>
        </Section>
      </>
    )
  },
})
