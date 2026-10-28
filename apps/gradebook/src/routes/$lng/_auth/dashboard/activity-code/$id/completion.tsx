import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { CompletionChart } from '@modulus-learning/host-tanstack-start/modules/app/activities/components/completion-chart'
import { getProgress } from '@modulus-learning/host-tanstack-start/modules/app/activities/get-progress'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_auth/dashboard/activity-code/$id/completion')({
  loader: ({ params }) => getProgress(params.id),
  head: ({ matches, params }) =>
    pageHead(
      { title: 'Completion', path: `/dashboard/activity-code/${params.id}/completion` },
      matches
    ),
  component: function CompletionPage() {
    const { lng, id } = Route.useParams()
    const data = Route.useLoaderData()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Activity Codes', href: '/dashboard' },
                { label: 'Activity Code', href: `/dashboard/activity-code/${id}` },
                { label: 'Completion', href: `/dashboard/activity-code/${id}/completion` },
              ]}
            />
          </Container>
        </Section>
        <Section>
          <Container className="sm:px-[32px]">
            <h1 className="mb-2">{data?.included?.activity_code?.code ?? 'Not Found'}</h1>
            {data?.included?.activity_code?.description && (
              <div>
                <p> {data?.included?.activity_code.description}</p>
              </div>
            )}
            <p className="text-muted-foreground mb-4">
              The chart below is an illustrative sample and does not represent this activity's
              learners or completion history.
            </p>
            <CompletionChart />
          </Container>
        </Section>
      </>
    )
  },
})
