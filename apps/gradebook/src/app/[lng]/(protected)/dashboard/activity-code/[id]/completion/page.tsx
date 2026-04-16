import { Container, Section } from '@infonomic/uikit/react'

import { CompletionChart } from '@/modules/app/activities/components/completion-chart'
import { getProgress } from '@/modules/app/activities/get-progress'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ lng: Locale; id: string }>
}): Promise<React.JSX.Element> {
  const { lng, id } = await params
  const data = await getProgress(id)

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
                href: `/dashboard/activity-code/${id}`,
              },
              {
                label: 'Completion',
                href: `/dashboard/activity-code/${id}/completion`,
              },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container className="sm:px-[32px]">
          <h1 className="mb-2">{data?.included?.activity_code?.code ?? 'Not Found'}</h1>
          <p className="text-muted-foreground mb-4">
            Tracking completion patterns for 5,000 students over a 3-month period
          </p>
          <CompletionChart data={data} />
        </Container>
      </Section>
    </>
  )
}
