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
    private_code: string
  }>
  searchParams: Promise<{
    page?: string
    desc?: string
    order?: string
    query?: string
    role?: string
  }>
}): Promise<React.JSX.Element> {
  const { lng, private_code } = await params
  const queryString = await searchParams

  if (validateSearchParamsSchema.safeParse(queryString).success === false) {
    notFound()
  }

  const data = await getProgress(private_code, queryString)

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
                href: `/dashboard/activity-code/${data?.included?.activity_code?.private_code}`,
              },
              {
                label: 'Learners',
                href: `/dashboard/activity-code/${data?.included?.activity_code?.private_code}/learners`,
              },
            ]}
          />
        </Container>
      </Section>

      <LearnersProgressView data={data} lng={lng} />
    </>
  )
}
