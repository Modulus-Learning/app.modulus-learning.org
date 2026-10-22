import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { ActivitiesView } from '@/modules/app/activities/components/activities-view'
import { getActivities } from '@/modules/app/activities/get-activities'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_auth/dashboard/activity-code/$id/activities/')({
  loader: async ({ params }) => {
    const data = await getActivities(params.id)
    if (data?.activity_code == null || data.activities == null) throw notFound()
    return { activityCode: data.activity_code, activities: data.activities }
  },
  head: ({ matches, params }) =>
    pageHead(
      { title: 'Activities', path: `/dashboard/activity-code/${params.id}/activities` },
      matches
    ),
  component: function ActivitiesPage() {
    const { lng, id } = Route.useParams()
    const { activityCode, activities } = Route.useLoaderData()
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
        <ActivitiesView activityCode={activityCode} activities={activities} lng={lng} />
      </>
    )
  },
})
