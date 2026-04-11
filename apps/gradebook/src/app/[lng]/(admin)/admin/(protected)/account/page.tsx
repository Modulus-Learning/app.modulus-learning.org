import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'

import { AccountContainer } from '@/modules/admin/account/components/account-container'
import { getAccount } from '@/modules/admin/account/get-account'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function AccountPage({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

  const data = await getAccount(lng)
  if (data?.user == null) notFound()

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
}
