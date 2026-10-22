import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { addUser } from '@/modules/admin/users/add'
import { UserCreateForm } from '@/modules/admin/users/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/users/add')({
  loader: async ({ params }) => {
    const { lng } = params
    const data = await addUser(lng)
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
                { label: 'Users', href: '/admin/users' },
                { label: 'Add User', href: '/admin/users/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <UserCreateForm lng={lng} roles={data?.included?.roles} />
          </Container>
        </Section>
      </>
    )
  },
})
