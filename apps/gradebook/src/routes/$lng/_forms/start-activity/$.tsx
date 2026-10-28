import { createFileRoute, getRouteApi, redirect } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { usePathname } from '@modulus-learning/host-tanstack-start/framework/index'
import { localeOutputRewrite } from '@modulus-learning/host-tanstack-start/i18n/locale-rewrite'
import { DEFAULT_SCOPE_ID } from '@modulus-learning/host-tanstack-start/lib/default-scope'
import { ssrRecoveryHref } from '@modulus-learning/host-tanstack-start/lib/session/bootstrap'
import { renewInBrowser } from '@modulus-learning/host-tanstack-start/lib/session/browser-renewal'
import { resolveGuardedSession } from '@modulus-learning/host-tanstack-start/lib/session/route-guard'
import { SessionGuardError } from '@modulus-learning/host-tanstack-start/lib/session/session-retry'
import type { StartActivityResult } from '@modulus-learning/host-tanstack-start/modules/app/activity/@types/index'
import { StartActivity } from '@modulus-learning/host-tanstack-start/modules/app/activity/components/start-activity'
import { extractActivityLaunchParameters } from '@modulus-learning/host-tanstack-start/modules/app/activity/launch-url'
import { startActivityFn } from '@modulus-learning/host-tanstack-start/modules/app/activity/start-activity-fn'
import { getUserSessionFn } from '@modulus-learning/host-tanstack-start/modules/app/session/session-state'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

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

    // Anonymous and renewable sessions are decided here, before the business
    // function runs (review R5): an anonymous visitor gets `needs_user`; an
    // expired session renews — through the bootstrap on a server render.
    const decision = await resolveGuardedSession({
      domain: 'user',
      load: () => getUserSessionFn(),
      renew: () => renewInBrowser('user'),
      isServer: typeof window === 'undefined',
    })
    if (decision.kind === 'ssr-recovery') {
      const visible = localeOutputRewrite(new URL(location.href, 'http://internal'))
      throw redirect({ href: ssrRecoveryHref('user', `${visible.pathname}${visible.search}`) })
    }
    if (decision.kind === 'anonymous') {
      const result: StartActivityResult = { status: 'needs_user', message: 'Needs user.' }
      return { go, destinationURL, result }
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
  errorComponent: SessionGuardError,
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
