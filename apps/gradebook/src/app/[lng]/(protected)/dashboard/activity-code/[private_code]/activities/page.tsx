import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'

import { ActivitiesView } from '@/modules/app/activities/components/activities-view'
import { getActivities } from '@/modules/app/activities/get-activities'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function Activities({
  params,
}: {
  params: Promise<{
    lng: Locale
    private_code: string
  }>
}): Promise<React.JSX.Element> {
  const { lng, private_code } = await params

  const data = await getActivities(private_code)

  if (data == null || data.activity_code == null || data.activities == null) {
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
              {
                label: 'Activities',
                href: `/dashboard/activity-code/${private_code}/activities`,
              },
            ]}
          />
        </Container>
      </Section>

      <ActivitiesView activityCode={data.activity_code} activities={data.activities} lng={lng} />
    </>
  )
}
