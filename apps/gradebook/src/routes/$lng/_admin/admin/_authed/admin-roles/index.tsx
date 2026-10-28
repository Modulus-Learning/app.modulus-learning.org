import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { AdminRolesListView } from '@modulus-learning/host-tanstack-start/modules/admin/admin-roles/components/list-view'
import { listAdminRoles } from '@modulus-learning/host-tanstack-start/modules/admin/admin-roles/list'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-roles/')({
  loader: async ({ params }) => {
    const { lng } = params

    const data = await listAdminRoles(lng)
    return { data }
  },
  component: function Page() {
    const { lng } = Route.useParams()
    const { data } = Route.useLoaderData()
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
  },
})
