import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RolesListView } from '@/modules/admin/roles/components/list-view'
import { listRoles } from '@/modules/admin/roles/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/roles/')({
  loader: async ({ params }) => {
    const { lng } = params

    const data = await listRoles(lng)
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
              breadcrumbs={[{ label: 'Roles', href: '/admin/roles' }]}
            />
          </Container>
        </Section>
        <RolesListView lng={lng} data={data} />
      </>
    )
  },
})
