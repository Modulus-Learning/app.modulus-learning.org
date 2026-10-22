import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RoleEditForm } from '@/modules/admin/roles/components/edit-form'
import { getRole } from '@/modules/admin/roles/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/roles/$id/edit')({
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
  },
})
