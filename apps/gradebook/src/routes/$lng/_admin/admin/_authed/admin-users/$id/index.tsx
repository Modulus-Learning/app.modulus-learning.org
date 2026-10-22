import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminUserDetailsView } from '@/modules/admin/admin-users/components/details-view'
import { getAdminUser } from '@/modules/admin/admin-users/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-users/$id/')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getAdminUser(id, lng)

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
                { label: 'Admin Users', href: '/admin/admin-users' },
                { label: 'Admin User', href: '/admin/admin-users/id' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <h1>
              {data?.user?.given_name} {data?.user?.family_name}
            </h1>
            <AdminUserDetailsView lng={lng} data={data} mode="view" />
          </Container>
        </Section>
        <FlashToast message={flashMessage} />
      </>
    )
  },
})
