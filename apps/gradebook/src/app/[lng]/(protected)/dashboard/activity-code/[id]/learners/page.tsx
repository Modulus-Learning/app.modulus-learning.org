import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'

import { validateSearchParamsSchema } from '@/modules/app/activities/@types'
import { LearnersProgressView } from '@/modules/app/activities/components/learners-progress-view'
import { getProgress } from '@/modules/app/activities/get-progress'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{
    lng: Locale
    id: string
  }>
  searchParams: Promise<{
    page?: string
    desc?: string
    order?: string
    query?: string
    role?: string
  }>
}): Promise<React.JSX.Element> {
  const { lng, id } = await params
  const queryString = await searchParams

  if (validateSearchParamsSchema.safeParse(queryString).success === false) {
    notFound()
  }

  const data = await getProgress(id, queryString)

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[
              { label: 'Activity Codes', href: '/dashboard' },
              {
                label: 'Activity Code',
                href: `/dashboard/activity-code/${id}`,
              },
              {
                label: 'Learners',
                href: `/dashboard/activity-code/${id}/learners`,
              },
            ]}
          />
        </Container>
      </Section>

      <LearnersProgressView data={data} lng={lng} />
    </>
  )
}
