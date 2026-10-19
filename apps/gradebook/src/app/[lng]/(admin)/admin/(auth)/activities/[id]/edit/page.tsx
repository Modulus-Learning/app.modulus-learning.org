import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AllowlistRuleEditForm } from '@/modules/admin/activity-url-allowlist/components/edit-form'
import { getAllowlistRule } from '@/modules/admin/activity-url-allowlist/get'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, {
    title: 'Allowlist Rule',
    path: '/admin/activities/id/edit',
  })
}

export default async function EditAllowlistRulePage({
  params,
}: {
  params: Promise<{
    id: string
    lng: Locale
  }>
}): Promise<React.JSX.Element> {
  const { id, lng } = await params
  const data = await getAllowlistRule(id, lng)

  if (data.rule == null) notFound()

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
              { label: 'Edit Rule', href: `/admin/activities/${data.rule.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <AllowlistRuleEditForm lng={lng} rule={data.rule} />
        </Container>
      </Section>
    </>
  )
}
