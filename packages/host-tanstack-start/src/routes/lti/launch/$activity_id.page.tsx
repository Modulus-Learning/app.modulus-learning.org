import { useLoaderData } from '@tanstack/react-router'

import { DEFAULT_SCOPE_ID } from '@/lib/default-scope'
import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import { LtiLaunchActivity } from '@/modules/lti/components/lti-launch-activity'

const ErrorCard = ({ title, message }: { title: string; message: string }) => (
  <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
    <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
      <h1 className="text-xl font-semibold mb-4">{title}</h1>
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
)

export const Page = function LtiLaunchPage() {
  const data = useLoaderData({ strict: false })
  if (data.kind === 'invalid') {
    return <ErrorCard title="Launch Error" message="Invalid or missing activity parameters." />
  }
  const { result, session } = data
  if (result.status === 'failed') {
    return <ErrorCard title="Launch Error" message={result.message} />
  }
  if (result.status === 'needs_user') {
    return (
      <ErrorCard
        title="Authentication Required"
        message="A valid session is required to launch this activity. Please return to your LMS and try again."
      />
    )
  }
  return (
    <LtiLaunchActivity
      session={session}
      destination={buildActivityLaunchUrl({
        activityUrl: result.data.activity.url,
        modulusServerUrl: result.data.modulus_server_url,
        scopeId: result.data.scope_id,
      })}
      activityUrl={result.data.activity.url}
      scopeName={result.data.scope_name}
      isDefaultScope={result.data.scope_id === DEFAULT_SCOPE_ID}
    />
  )
}
