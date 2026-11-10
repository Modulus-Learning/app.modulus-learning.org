import { getRouteApi, useLoaderData, useParams, useRouteContext } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { UserDetailsView } from '@/modules/admin/users/components/details-view'
import {
  LtiIdentityPanel,
  ltiIdentityPanelKey,
} from '@/modules/admin/users/components/lti-identity-panel'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
  const flashMessage = rootRoute.useLoaderData().flash
  const { adminSession } = useRouteContext({ strict: false }) as {
    adminSession?: { abilities?: string[] }
  }
  const user = data?.user
  const lti = data?.included?.lti ?? null
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
          {user != null && (
            <LtiIdentityPanel
              key={ltiIdentityPanelKey({ userId: user.id, vid: user.vid, lti })}
              userId={user.id}
              vid={user.vid}
              lti={lti}
              canUnlink={adminSession?.abilities?.includes('users:edit') === true}
            />
          )}
        </Container>
      </Section>
      <FlashToast message={flashMessage} />
    </>
  )
}
