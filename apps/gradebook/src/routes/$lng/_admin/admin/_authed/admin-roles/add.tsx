import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminRoleCreateForm } from '@/modules/admin/admin-roles/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-roles/add')({
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
                { label: 'Admin Roles', href: '/admin/admin-roles' },
                { label: 'Add Admin Role', href: '/admin/admin-roles/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <AdminRoleCreateForm lng={lng} />
          </Container>
        </Section>
      </>
    )
  },
})
