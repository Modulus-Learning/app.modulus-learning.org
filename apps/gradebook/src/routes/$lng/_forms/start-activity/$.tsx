import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'

import { usePathname } from '@/framework'
import { StartActivity } from '@/modules/app/activity/components/start-activity'
import { extractActivityLaunchParameters } from '@/modules/app/activity/launch-url'
import { startActivityFn } from '@/modules/app/activity/start-activity-fn'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

const formsLayout = getRouteApi('/$lng/_forms')

/**
 * The non-LTI activity launch: `/start-activity/<code>/<activity url…>`.
 *
 * The segments are read from the raw (still percent-encoded) path, as the Next
 * catch-all `[...go]` delivered them, rather than from the router's decoded
 * splat param: `extractActivityLaunchParameters` owns the decoding.
 */
export const Route = createFileRoute('/$lng/_forms/start-activity/$')({
  loader: async ({ location }) => {
    const raw = location.pathname.split('/start-activity/')[1] ?? ''
    const go = raw.split('/').filter((segment) => segment.length > 0)
    const { activityCode, destinationURL } = extractActivityLaunchParameters(go)
    if (!activityCode || !destinationURL) {
      return { go, destinationURL: null, result: null }
    }
    const result = await startActivityFn({
      data: {
        activity_code: activityCode,
        activity_url: destinationURL,
        scope_id: DEFAULT_SCOPE_ID,
      },
    })
    return { go, destinationURL, result }
  },
  component: StartActivityPage,
})

function StartActivityPage() {
  const { lng } = Route.useParams()
  const { go, destinationURL, result } = Route.useLoaderData()
  const { session } = formsLayout.useLoaderData()
  // The visible path, as the Next proxy's X-Current-Path header carried it.
  const currentPath = usePathname()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[{ label: 'Start Activity', href: '/start-activity' }]}
          />
        </Container>
      </Section>
      {destinationURL == null || result == null ? (
        <Section>
          <Container className="sm:px-8">
            <h1 className="mb-4">Start Activity</h1>
            <p>Invalid or missing parameters</p>
            <p>Parameters: {go.length > 0 ? go.join(' ') : ''} </p>
          </Container>
        </Section>
      ) : (
        <Section>
          <Container className="mb-8">
            <h1 className="mb-4">Welcome to Modulus</h1>
            <StartActivity
              lng={lng}
              session={session}
              currentPath={currentPath}
              destinationURL={destinationURL}
              startActivityResult={result}
            />
          </Container>
        </Section>
      )}
    </>
  )
}
