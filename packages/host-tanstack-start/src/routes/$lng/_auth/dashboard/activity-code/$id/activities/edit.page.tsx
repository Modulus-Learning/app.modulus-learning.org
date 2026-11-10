import { getRouteApi, useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivityCodeContainer } from '@/modules/app/activities/components/activity-code-container'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

const authLayout = getRouteApi('/$lng/_auth')

export const Page = function EditActivitiesPage() {
  const { lng } = useParams({ strict: false })
  const { activityCode, activities, members } = useLoaderData({ strict: false })
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
}
