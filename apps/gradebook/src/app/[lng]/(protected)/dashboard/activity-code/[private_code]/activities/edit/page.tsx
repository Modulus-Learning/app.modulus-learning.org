import { notFound } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'

import { EditActivitiesForm } from '@/modules/app/activities/components/edit-activities-form'
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
                href: `/dashboard/activity-code/${data?.activity_code?.private_code}`,
              },
              {
                label: 'Activities',
                href: `/dashboard/activity-code/${data?.activity_code?.private_code}/activities`,
              },
              {
                label: 'Edit',
                href: `/dashboard/activity-code/${data?.activity_code?.private_code}/activities/edit`,
              },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data.activity_code.code} </h1>
          <EditActivitiesForm
            activityCode={data.activity_code}
            activities={data.activities}
            lng={lng}
          />
        </Container>
      </Section>
    </>
  )
}
