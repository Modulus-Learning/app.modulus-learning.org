import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { LtiPlatformDetailsView } from '@/modules/admin/lti-platforms/components/details-view'
import { getLtiPlatform } from '@/modules/admin/lti-platforms/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'LTI Platform',
    path: '/admin/lti-platforms/id',
  })
}

export default async function LtiPlatformPage({
  params,
}: {
  params: Promise<{
    id: string
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { id, lng } = await params
  const data = await getLtiPlatform(id, lng)

  if (data?.platform == null) notFound()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'LTI Platforms', href: '/admin/lti-platforms' },
              { label: 'LTI Platform', href: '/admin/lti-platforms/id' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.platform?.name}</h1>
          <LtiPlatformDetailsView lng={lng} data={data} mode="view" />
        </Container>
      </Section>
    </>
  )
}
