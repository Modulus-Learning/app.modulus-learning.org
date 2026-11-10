import { useLoaderData, useParams, useSearch } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivitiesView } from '@/modules/app/activities/components/activities-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function ActivitiesPage() {
  const { lng, id } = useParams({ strict: false })
  const { activityCode, activities } = useLoaderData({ strict: false })
  const search = useSearch({ strict: false }) as Record<string, unknown>
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[
              { label: 'Activity Codes', href: '/dashboard' },
              { label: 'Activity Code', href: `/dashboard/activity-code/${id}` },
              { label: 'Activities', href: `/dashboard/activity-code/${id}/activities` },
            ]}
          />
        </Container>
      </Section>
      <ActivitiesView
        activityCode={activityCode}
        activities={activities}
        search={search}
        lng={lng}
      />
    </>
  )
}
