import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminUserCreateForm } from '@/modules/admin/admin-users/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
              { label: 'Add Admin User', href: '/admin/admin-users/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <AdminUserCreateForm lng={lng} roles={data?.included?.roles} />
        </Container>
      </Section>
    </>
  )
}
