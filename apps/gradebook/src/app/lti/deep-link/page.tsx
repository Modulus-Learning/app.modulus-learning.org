import { redirect } from 'next/navigation'

import { Section } from '@infonomic/uikit/react'

import { getActivityCodes } from '@/modules/app/activities/get-activity-codes'
import { DeepLinkingForm } from '@/modules/lti/components/deep-linking-form'

export default async function DeepLinkingPage({
  searchParams,
}: {
  searchParams: Promise<{ id: string }>
}) {
  const { id: launchId } = await searchParams

  if (typeof launchId !== 'string') {
    return redirect('/')
  }

  const { activity_codes } = await getActivityCodes()

  return (
    <Section className="py-5 pb-2">
      <DeepLinkingForm launchId={launchId} activityCodes={activity_codes} />
    </Section>
  )
}
