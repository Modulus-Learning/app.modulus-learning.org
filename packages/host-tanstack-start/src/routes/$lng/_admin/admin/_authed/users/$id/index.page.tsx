import { getRouteApi, useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserDetailsView } from '@/modules/admin/users/components/details-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
              { label: 'Users', href: '/admin/users' },
              { label: 'User', href: '/admin/users/id' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.user?.full_name}</h1>
          <UserDetailsView lng={lng} data={data} mode="view" />
        </Container>
      </Section>
      <FlashToast message={flashMessage} />
    </>
  )
}
