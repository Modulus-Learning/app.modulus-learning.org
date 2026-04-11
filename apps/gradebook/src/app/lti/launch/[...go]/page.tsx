import type React from 'react'

import { startActivity } from '@/modules/app/activity/start-activity'
import { getUserSession } from '@/modules/app/session/storage'
import { LtiLaunchActivity } from '@/modules/lti/components/lti-launch-activity'

function extractParameters(params: string[]): Record<string, string | null> {
  const receivedParams = [...params]
  if (receivedParams.length > 0) {
    const activityCode = receivedParams[0]
    receivedParams.shift()
    let destinationURL = decodeURIComponent(receivedParams.join('/'))
    // Next.js specific fixup. There is no way to prevent
    // Next.js from 'normalizing' URLs to remove double
    // forward slashes - and so we have to put them back here.
    destinationURL = destinationURL.replace('http:/', 'http://').replace('https:/', 'https://')
    return { activityCode, destinationURL }
  }
  return { activityCode: null, destinationURL: null }
}

export default async function LtiLaunchPage({
  params,
}: {
  params: Promise<{ go: string[] }>
}): Promise<React.JSX.Element> {
  const { go } = await params
  const { activityCode, destinationURL } = extractParameters(go)
  const session = await getUserSession()

  if (
    activityCode == null ||
    activityCode.length === 0 ||
    destinationURL == null ||
    destinationURL.length === 0
  ) {
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

  const result = await startActivity(activityCode, destinationURL)

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

  return <LtiLaunchActivity session={session} startActivityResult={result} />
}
