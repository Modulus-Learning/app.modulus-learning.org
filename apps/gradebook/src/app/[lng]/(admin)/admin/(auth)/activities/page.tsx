import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AllowlistRulesListView } from '@/modules/admin/activity-url-allowlist/components/list-view'
import { listAllowlistRules } from '@/modules/admin/activity-url-allowlist/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Activities',
    path: '/admin/activities',
  })
}

export default async function ActivitiesPage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  const data = await listAllowlistRules(lng)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'Activities', href: '/admin/activities' }]}
          />
        </Container>
      </Section>
      <AllowlistRulesListView data={data} lng={lng} />
    </>
  )
}
