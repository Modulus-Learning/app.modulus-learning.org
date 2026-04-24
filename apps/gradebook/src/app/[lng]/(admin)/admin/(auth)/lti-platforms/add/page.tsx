import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { LtiPlatformCreateForm } from '@/modules/admin/lti-platforms/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Add LTI Platform',
    path: '/admin/lti-platforms/add',
  })
}

export default async function AddLtiPlatformPage({
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
              { label: 'LTI Platforms', href: '/admin/lti-platforms' },
              { label: 'Add LTI Platform', href: '/admin/lti-platforms/add' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <LtiPlatformCreateForm lng={lng} />
        </Container>
      </Section>
    </>
  )
}
