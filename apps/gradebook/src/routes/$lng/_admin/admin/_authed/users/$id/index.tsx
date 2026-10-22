import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserDetailsView } from '@/modules/admin/users/components/details-view'
import { getUser } from '@/modules/admin/users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Route = createFileRoute('/$lng/_admin/admin/_authed/users/$id/')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getUser(id, lng)

    if (data?.user == null) throw notFound()
    return { data: { ...data, user: data.user } }
  },
  component: function Page() {
    const { id, lng } = Route.useParams()
    const { data } = Route.useLoaderData()
    const flashMessage = rootRoute.useLoaderData().flash
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
                { label: 'User', href: '/admin/users/id' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>{data?.user?.full_name}</h1>
            <UserDetailsView lng={lng} data={data} mode="view" />
          </Container>
        </Section>
        <FlashToast message={flashMessage} />
      </>
    )
  },
})
