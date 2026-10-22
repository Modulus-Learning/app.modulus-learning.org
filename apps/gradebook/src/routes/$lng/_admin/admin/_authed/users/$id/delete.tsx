import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserDetailsView } from '@/modules/admin/users/components/details-view'
import { getUser } from '@/modules/admin/users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/users/$id/delete')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getUser(id, lng)

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
                { label: 'Users', href: '/admin/users' },
                { label: 'User', href: `/admin/users/${data?.user?.id}` },
                { label: 'Delete', href: `/admin/users/${data?.user?.id}/delete` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>{data?.user?.full_name}</h1>
            <UserDetailsView lng={lng} data={data} mode="delete" />
          </Container>
        </Section>
      </>
    )
  },
})
