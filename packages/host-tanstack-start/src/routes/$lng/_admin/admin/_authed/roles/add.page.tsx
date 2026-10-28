import { useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { RoleCreateForm } from '@/modules/admin/roles/components/create-form'
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
}
