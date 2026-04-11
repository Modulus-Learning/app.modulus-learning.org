import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivityCodeMenu } from '@/modules/app/activities/components/activity-code-menu'
import { getActivityCode } from '@/modules/app/activities/get-activity-code'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function ProgressPage({
  params,
}: {
  params: Promise<{
    lng: Locale
    private_code: string
  }>
}): Promise<React.JSX.Element> {
  const { lng, private_code } = await params

  const data = await getActivityCode(private_code)
  if (data == null || data.activity_code == null) {
    notFound()
  }

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
                href: `/dashboard/activity-code/${private_code}`,
              },
            ]}
          />
        </Container>
      </Section>

      <ActivityCodeMenu lng={lng} activityCode={data.activity_code} />
    </>
  )
}
