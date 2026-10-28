import { useLoaderData } from '@tanstack/react-router'

import { Section } from '@infonomic/uikit/react'

import { SessionIdentity } from '@/lib/session/session-identity'
import { DeepLinkingForm } from '@/modules/lti/components/deep-linking-form'

export const Page = function DeepLinkingPage() {
  const { launchId, activityCodes, userId } = useLoaderData({ strict: false })
  return (
    <Section className="py-5 pb-2">
      <SessionIdentity domain="user" userId={userId} />
      <DeepLinkingForm launchId={launchId} activityCodes={activityCodes} />
    </Section>
  )
}
