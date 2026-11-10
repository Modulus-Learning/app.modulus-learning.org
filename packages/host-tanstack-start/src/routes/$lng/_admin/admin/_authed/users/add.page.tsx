import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserCreateForm } from '@/modules/admin/users/components/create-form'
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
}
