import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { ActivityCodeContainer } from '@modulus-learning/host-tanstack-start/modules/app/activities/components/activity-code-container'
import { getActivities } from '@modulus-learning/host-tanstack-start/modules/app/activities/get-activities'
import { listActivityCodeMembers } from '@modulus-learning/host-tanstack-start/modules/app/activities/list-activity-code-members'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

const authLayout = getRouteApi('/$lng/_auth')

export const Route = createFileRoute('/$lng/_auth/dashboard/activity-code/$id/activities/edit')({
  loader: async ({ params }) => {
    const [data, { members }] = await Promise.all([
      getActivities(params.id),
      listActivityCodeMembers(params.id),
    ])
    if (data?.activity_code == null || data.activities == null) throw notFound()
    return { activityCode: data.activity_code, activities: data.activities, members }
  },
  head: ({ matches, params }) =>
    pageHead(
      { title: 'Edit Activities', path: `/dashboard/activity-code/${params.id}/activities/edit` },
      matches
    ),
  component: function EditActivitiesPage() {
    const { lng } = Route.useParams()
    const { activityCode, activities, members } = Route.useLoaderData()
    const { session } = authLayout.useLoaderData()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Activity Codes', href: '/dashboard' },
                { label: 'Activity Code', href: `/dashboard/activity-code/${activityCode.id}` },
                {
                  label: 'Activities',
                  href: `/dashboard/activity-code/${activityCode.id}/activities`,
                },
                {
                  label: 'Edit',
                  href: `/dashboard/activity-code/${activityCode.id}/activities/edit`,
                },
              ]}
            />
          </Container>
        </Section>
        <Section>
          <Container>
            <h1 className="mb-4">{activityCode.code} </h1>
            <ActivityCodeContainer
              activities={activities}
              activityCode={activityCode}
              members={members}
              currentUserId={session.user.id}
              lng={lng}
            />
          </Container>
        </Section>
      </>
    )
  },
})
