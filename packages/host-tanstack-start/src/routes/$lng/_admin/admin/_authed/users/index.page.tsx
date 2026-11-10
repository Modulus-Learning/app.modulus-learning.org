import { getRouteApi, useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UsersListView } from '@/modules/admin/users/components/list-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
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
            breadcrumbs={[{ label: 'Users', href: '/admin/users' }]}
          />
        </Container>
      </Section>
      <UsersListView lng={lng} data={data} />
      <FlashToast message={flashMessage} />
    </>
  )
}
