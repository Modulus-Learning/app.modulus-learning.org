import type React from 'react'

import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { z } from 'zod'

import { getActivityLaunchView } from '@/modules/app/activity/activity-launch-view'
import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import { getUserSession } from '@/modules/app/session/storage'
import { LtiLaunchActivity } from '@/modules/lti/components/lti-launch-activity'

/**
 * The LTI launch interstitial, keyed on the resolved activity's id:
 *
 *     /lti/launch/{activity_id}?scope_id={uuid}
 *
 * No Modulus-owned URL on the LTI path embeds an activity URL. A malformed
 * parameter renders the Launch Error card in place rather than redirecting to
 * `/lti/error`, which exists for failures that have no page of their own.
 */
export default async function LtiLaunchPage({
  params,
  searchParams,
}: {
  params: Promise<{ activity_id: string }>
  searchParams: Promise<{ scope_id?: string | string[] }>
}): Promise<React.JSX.Element> {
  const { activity_id } = await params
  const { scope_id } = await searchParams
  const session = await getUserSession()

  const parsedActivity = z.uuid().safeParse(activity_id)
  const parsedScope = z.uuid().safeParse(scope_id)

  if (!parsedActivity.success || !parsedScope.success) {
    return (
      <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
          <h1 className="text-xl font-semibold mb-4">Launch Error</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Invalid or missing activity parameters.
          </p>
        </div>
      </div>
    )
  }

  const result = await getActivityLaunchView(parsedActivity.data, parsedScope.data)

  if (result.status === 'failed') {
    return (
      <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
          <h1 className="text-xl font-semibold mb-4">Launch Error</h1>
          <p className="text-gray-600">{result.message}</p>
        </div>
      </div>
    )
  }

  if (result.status === 'needs_user') {
    return (
      <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
          <h1 className="text-xl font-semibold mb-4">Authentication Required</h1>
          <p className="text-gray-600">
            A valid session is required to launch this activity. Please return to your LMS and try
            again.
          </p>
        </div>
      </div>
    )
  }

  // The destination is built here rather than in the client component, so the
  // launch anchor is present in the server-rendered HTML.
  const destination = buildActivityLaunchUrl({
    activityUrl: result.data.activity.url,
    modulusServerUrl: result.data.modulus_server_url,
    scopeId: result.data.scope_id,
  })

  // Keep the core-only sentinel comparison in this server component instead
  // of importing the core package into the client component's browser bundle.
  return (
    <LtiLaunchActivity
      session={session}
      destination={destination}
      activityUrl={result.data.activity.url}
      scopeName={result.data.scope_name}
      isDefaultScope={result.data.scope_id === DEFAULT_SCOPE_ID}
    />
  )
}
