import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AccountContainer } from '@/modules/admin/account/components/account-container'
import { getAccount } from '@/modules/admin/account/get-account'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/account')({
  loader: async ({ params }) => {
    const { lng } = params

    const data = await getAccount(lng)
    if (data?.user == null) throw notFound()
    return { data: { ...data, user: data.user } }
  },
  component: function Page() {
    const { lng } = Route.useParams()
    const { data } = Route.useLoaderData()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Admin', href: '/admin' },
                { label: 'Account', href: '/admin/account' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <div className="flex justify-between items-center p-2 mb-2">
              <h1>Account Settings</h1>
            </div>
            <AccountContainer lng={lng} user={data.user} />
          </Container>
        </Section>
      </>
    )
  },
})
