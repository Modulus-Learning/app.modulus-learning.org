import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserEditForm } from '@/modules/admin/users/components/edit-form'
import { getUser } from '@/modules/admin/users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/users/$id/edit')({
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
                { label: 'Edit', href: `/admin/users/${data?.user?.id}/edit` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>{data?.user?.full_name}</h1>
            <UserEditForm lng={lng} data={data} />
          </Container>
        </Section>
      </>
    )
  },
})
