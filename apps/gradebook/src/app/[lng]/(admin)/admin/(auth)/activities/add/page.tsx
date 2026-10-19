import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AllowlistRuleCreateForm } from '@/modules/admin/activity-url-allowlist/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Add Allowlist Rule',
    path: '/admin/activities/add',
  })
}

export default async function AddAllowlistRulePage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'Activities', href: '/admin/activities' },
              { label: 'Add Rule', href: '/admin/activities/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <AllowlistRuleCreateForm lng={lng} />
        </Container>
      </Section>
    </>
  )
}
