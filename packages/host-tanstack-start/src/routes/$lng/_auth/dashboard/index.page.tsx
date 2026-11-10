import { useLoaderData, useParams, useSearch } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivityCodesView } from '@/modules/app/activities/components/activity-codes-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { getActivityCodes } from '@/modules/app/activities/get-activity-codes'

export const Page = function ActivityList() {
  const { lng } = useParams({ strict: false })
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const { activity_codes } = useLoaderData({ strict: false }) as Awaited<
    ReturnType<typeof getActivityCodes>
  >
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs lng={lng} breadcrumbs={[{ label: 'Activity Codes', href: '/dashboard' }]} />
        </Container>
      </Section>

      <Section>
        <Container className="sm:px-8 mb-8">
          <ActivityCodesView activityCodes={activity_codes} search={search} lng={lng} />
        </Container>
      </Section>
    </>
  )
}
