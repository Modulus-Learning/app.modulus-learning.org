import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserEditForm } from '@/modules/admin/users/components/edit-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
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
              { label: 'User', href: `/admin/users/${data?.user?.id}` },
              { label: 'Edit', href: `/admin/users/${data?.user?.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.user?.full_name}</h1>
          <UserEditForm lng={lng} data={data} />
        </Container>
      </Section>
    </>
  )
}
