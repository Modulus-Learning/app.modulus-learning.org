import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { LtiPlatformsListView } from '@/modules/admin/lti-platforms/components/list-view'
import { listLtiPlatforms } from '@/modules/admin/lti-platforms/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'LTI Platforms',
    path: '/admin/lti-platforms',
  })
}

export default async function LtiPlatformsPage({
  params,
}: {
  params: Promise<{
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

  const data = await listLtiPlatforms(lng)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'LTI Platforms', href: '/admin/lti-platforms' }]}
          />
        </Container>
      </Section>
      <LtiPlatformsListView lng={lng} data={data} />
    </>
  )
}
