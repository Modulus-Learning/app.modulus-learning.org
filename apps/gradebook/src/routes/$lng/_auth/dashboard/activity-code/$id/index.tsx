import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { ActivityCodeMenu } from '@/modules/app/activities/components/activity-code-menu'
import { getActivityCode } from '@/modules/app/activities/get-activity-code'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_auth/dashboard/activity-code/$id/')({
  loader: async ({ params }) => {
    const data = await getActivityCode(params.id)
    if (data?.activity_code == null) throw notFound()
    return { activityCode: data.activity_code }
  },
  head: ({ matches, params }) =>
    pageHead({ title: 'Activity Code', path: `/dashboard/activity-code/${params.id}` }, matches),
  component: function ActivityCodePage() {
    const { lng, id } = Route.useParams()
    const { activityCode } = Route.useLoaderData()
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
  },
})
