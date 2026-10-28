import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { addAdminUser } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/add'
import { AdminUserCreateForm } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/components/create-form'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-users/add')({
  loader: async ({ params }) => {
    const { lng } = params
    const data = await addAdminUser(lng)
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
              breadcrumbs={[
                { label: 'Admin Users', href: '/admin/admin-users' },
                { label: 'Add Admin User', href: '/admin/admin-users/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <AdminUserCreateForm lng={lng} roles={data?.included?.roles} />
          </Container>
        </Section>
      </>
    )
  },
})
