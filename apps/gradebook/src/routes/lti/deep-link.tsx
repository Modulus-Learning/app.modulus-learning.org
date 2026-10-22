import { createFileRoute, redirect } from '@tanstack/react-router'

import { Section } from '@infonomic/uikit/react'
import { z } from 'zod'

import { listActivityCodesFn } from '@/modules/app/activities/activity-codes-fn'
import { DeepLinkingForm } from '@/modules/lti/components/deep-linking-form'

// LTI deep-linking picker (`/lti/deep-link?id=<launch id>`).
export const Route = createFileRoute('/lti/deep-link')({
  validateSearch: z.object({ id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    if (deps.id == null) throw redirect({ href: '/' })
    const codes = await listActivityCodesFn()
    if (codes == null) throw new Error('Unauthenticated')
    return { launchId: deps.id, activityCodes: codes.activity_codes }
  },
  component: function DeepLinkingPage() {
    const { launchId, activityCodes } = Route.useLoaderData()
    return (
      <Section className="py-5 pb-2">
        <DeepLinkingForm launchId={launchId} activityCodes={activityCodes} />
      </Section>
    )
  },
})
