import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AdminUserEditForm } from '@/modules/admin/admin-users/components/edit-form'
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
              { label: 'Admin Users', href: '/admin/admin-users' },
              { label: 'Admin User', href: `/admin/admin-users/${data?.user?.id}` },
              { label: 'Edit', href: `/admin/admin-users/${data?.user?.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>
            {data?.user?.given_name} {data?.user?.family_name}
          </h1>
          <AdminUserEditForm lng={lng} data={data} />
        </Container>
      </Section>
    </>
  )
}
