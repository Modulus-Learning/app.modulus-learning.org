import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RoleCreateForm } from '@/modules/admin/roles/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/roles/add')({
  component: function Page() {
    const { lng } = Route.useParams()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              homeLabel="Admin"
              homePath="/admin"
              lng={lng}
              breadcrumbs={[
                { label: 'Roles', href: '/admin/roles' },
                { label: 'Add Role', href: '/admin/roles/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <RoleCreateForm lng={lng} />
          </Container>
        </Section>
      </>
    )
  },
})
