import { createFileRoute } from '@tanstack/react-router'

import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { z } from 'zod'

import { getActivityLaunchViewFn } from '@/modules/app/activity/activity-launch-view-fn'
import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import { getUserSessionFn } from '@/modules/app/session/session-state'
import { LtiLaunchActivity } from '@/modules/lti/components/lti-launch-activity'

const ErrorCard = ({ title, message }: { title: string; message: string }) => (
  <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
    <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
      <h1 className="text-xl font-semibold mb-4">{title}</h1>
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
)

/**
 * The LTI launch interstitial (`/lti/launch/<activity_id>?scope_id=…`), shown
 * when `LTI_LAUNCH_INTERSTITIAL=always` (see `docs/DEPLOYMENT.md`).
 */
export const Route = createFileRoute('/lti/launch/$activity_id')({
  validateSearch: z.object({ scope_id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ scope_id: search.scope_id }),
  loader: async ({ params, deps }) => {
    const activity = z.uuid().safeParse(params.activity_id)
    const scope = z.uuid().safeParse(deps.scope_id)
    if (!activity.success || !scope.success) return { kind: 'invalid' as const }

    const [result, { session }] = await Promise.all([
      getActivityLaunchViewFn({ data: { activity_id: activity.data, scope_id: scope.data } }),
      getUserSessionFn(),
    ])
    return { kind: 'result' as const, result, session }
  },
  component: function LtiLaunchPage() {
    const data = Route.useLoaderData()
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
  },
})
