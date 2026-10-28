import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LearnersProgressView } from '@/modules/app/activities/components/learners-progress-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function LearnersPage() {
  const { lng, id } = useParams({ strict: false })
  const data = useLoaderData({ strict: false })
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[
              { label: 'Activity Codes', href: '/dashboard' },
              { label: 'Activity Code', href: `/dashboard/activity-code/${id}` },
              { label: 'Learners', href: `/dashboard/activity-code/${id}/learners` },
            ]}
          />
        </Container>
      </Section>
      <LearnersProgressView data={data} lng={lng} />
    </>
  )
}
