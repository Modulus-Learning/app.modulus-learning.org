import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { AccountContainer } from '@/modules/app/account/components/account-container'
import { getAccount } from '@/modules/app/account/get-account'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_auth/account')({
  loader: async ({ params }) => {
    const data = await getAccount(params.lng)
    if (data?.user == null) throw notFound()
    return { user: data.user }
  },
  head: ({ matches }) => pageHead({ title: 'Account', path: '/account' }, matches),
  component: function AccountPage() {
    const { lng } = Route.useParams()
    const { user } = Route.useLoaderData()
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
  },
})
