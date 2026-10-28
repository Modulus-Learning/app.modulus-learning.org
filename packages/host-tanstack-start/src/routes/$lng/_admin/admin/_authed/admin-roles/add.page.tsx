import { useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminRoleCreateForm } from '@/modules/admin/admin-roles/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
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
}
