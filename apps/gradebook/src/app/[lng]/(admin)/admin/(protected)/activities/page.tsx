import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
  searchParams: Promise<{
    order?: string
    query?: string
    page?: string
  }>
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
      <Section>
        <Container>
          <div className="flex items-center gap-3 py-[2px]">
            <h1 className="!m-0 pb-[2px]">Activities</h1>
          </div>
        </Container>
      </Section>
    </>
  )
}
