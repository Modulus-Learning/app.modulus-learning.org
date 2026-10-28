import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { AdminUserEditForm } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/components/edit-form'
import { getAdminUser } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/get'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-users/$id/edit')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getAdminUser(id, lng)

    if (data?.user == null) throw notFound()
    return { data: { ...data, user: data.user } }
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
                { label: 'Admin Users', href: '/admin/admin-users' },
                { label: 'Admin User', href: `/admin/admin-users/${data?.user?.id}` },
                { label: 'Edit', href: `/admin/admin-users/${data?.user?.id}/edit` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>
              {data?.user?.given_name} {data?.user?.family_name}
            </h1>
            <AdminUserEditForm lng={lng} data={data} />
          </Container>
        </Section>
      </>
    )
  },
})
