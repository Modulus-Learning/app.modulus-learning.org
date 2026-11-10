import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivityCodeMenu } from '@/modules/app/activities/components/activity-code-menu'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function ActivityCodePage() {
  const { lng, id } = useParams({ strict: false })
  const { activityCode } = useLoaderData({ strict: false })
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[
              { label: 'Activity Codes', href: '/dashboard' },
              { label: 'Activity Code', href: `/dashboard/activity-code/${id}` },
            ]}
          />
        </Container>
      </Section>
      <ActivityCodeMenu lng={lng} activityCode={activityCode} />
    </>
  )
}
