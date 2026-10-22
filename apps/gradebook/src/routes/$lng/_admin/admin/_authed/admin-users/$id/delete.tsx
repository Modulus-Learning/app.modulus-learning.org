import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminUserDetailsView } from '@/modules/admin/admin-users/components/details-view'
import { getAdminUser } from '@/modules/admin/admin-users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-users/$id/delete')({
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
                { label: 'Delete', href: `/admin/admin-users/${data?.user?.id}/delete` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>
              {data?.user?.given_name} {data?.user?.family_name}
            </h1>
            <AdminUserDetailsView lng={lng} data={data} mode="delete" />
          </Container>
        </Section>
      </>
    )
  },
})
