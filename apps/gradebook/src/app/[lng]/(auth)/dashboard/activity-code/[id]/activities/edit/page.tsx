import { notFound, redirect } from 'next/navigation'

import { Container, Section } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getCoreUserRequestContext } from '@/core-adapter'
import { getMeta } from '@/lib/meta'
import { ActivityCodeContainer } from '@/modules/app/activities/components/activity-code-container'
import { getActivities } from '@/modules/app/activities/get-activities'
import { listActivityCodeMembers } from '@/modules/app/activities/list-activity-code-members'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale; id: string }>
}): Promise<Metadata> {
  const { lng } = await params
  return getMeta(lng, { title: 'Edit Activity Code' })
}

export default async function Activities({
  params,
}: {
  params: Promise<{
    lng: Locale
    id: string
  }>
}): Promise<React.JSX.Element> {
  const { lng, id } = await params

  const context = await getCoreUserRequestContext()
  if (context == null) {
    redirect('/')
  }

  const data = await getActivities(id)

  if (data == null || data.activity_code == null || data.activities == null) {
    notFound()
  }

  const { members } = await listActivityCodeMembers(id)

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
                href: `/dashboard/activity-code/${data.activity_code.id}`,
              },
              {
                label: 'Activities',
                href: `/dashboard/activity-code/${data.activity_code.id}/activities`,
              },
              {
                label: 'Edit',
                href: `/dashboard/activity-code/${data.activity_code.id}/activities/edit`,
              },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1 className="mb-4">{data.activity_code.code} </h1>
          <ActivityCodeContainer
            activities={data.activities}
            activityCode={data.activity_code}
            members={members}
            currentUserId={context.userAuth.id}
            lng={lng}
          />
        </Container>
      </Section>
    </>
  )
}
