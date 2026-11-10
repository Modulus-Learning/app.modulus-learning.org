import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AccountContainer } from '@/modules/app/account/components/account-container'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function AccountPage() {
  const { lng } = useParams({ strict: false })
  const { user } = useLoaderData({ strict: false })
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs lng={lng} breadcrumbs={[{ label: 'Account', href: '/account' }]} />
        </Container>
      </Section>
      <Section>
        <Container>
          <div className="flex justify-between items-center p-2 mb-2">
            <h1>Account Settings</h1>
          </div>
          <AccountContainer lng={lng} user={user} />
        </Container>
      </Section>
    </>
  )
}
