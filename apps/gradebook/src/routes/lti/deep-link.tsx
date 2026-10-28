import { createFileRoute, redirect } from '@tanstack/react-router'

import { Section } from '@infonomic/uikit/react'
import { ssrRecoveryHref } from '@modulus-learning/host-tanstack-start/lib/session/bootstrap'
import { renewInBrowser } from '@modulus-learning/host-tanstack-start/lib/session/browser-renewal'
import { resolveGuardedSession } from '@modulus-learning/host-tanstack-start/lib/session/route-guard'
import { SessionIdentity } from '@modulus-learning/host-tanstack-start/lib/session/session-identity'
import { SessionGuardError } from '@modulus-learning/host-tanstack-start/lib/session/session-retry'
import { listActivityCodesFn } from '@modulus-learning/host-tanstack-start/modules/app/activities/activity-codes-fn'
import { getUserSessionFn } from '@modulus-learning/host-tanstack-start/modules/app/session/session-state'
import { DeepLinkingForm } from '@modulus-learning/host-tanstack-start/modules/lti/components/deep-linking-form'
import { z } from 'zod'

// LTI deep-linking picker (`/lti/deep-link?id=<launch id>`). The page's own
// session establishes the identity its submission must carry (review R5): an
// expired session renews here — through the bootstrap on a server render —
// before the form is shown, and `SessionIdentity` registers the principal the
// submission sends.
export const Route = createFileRoute('/lti/deep-link')({
  validateSearch: z.object({ id: z.string().optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps, location }) => {
    if (deps.id == null) throw redirect({ href: '/' })
    const decision = await resolveGuardedSession({
      domain: 'user',
      load: () => getUserSessionFn(),
      renew: () => renewInBrowser('user'),
      isServer: typeof window === 'undefined',
    })
    if (decision.kind === 'ssr-recovery') {
      throw redirect({ href: ssrRecoveryHref('user', `${location.pathname}${location.searchStr}`) })
    }
    if (decision.kind === 'anonymous') throw new Error('Unauthenticated')
    const codes = await listActivityCodesFn()
    if (codes == null) throw new Error('Unauthenticated')
    return {
      launchId: deps.id,
      activityCodes: codes.activity_codes,
      userId: decision.session.user.id,
    }
  },
  errorComponent: SessionGuardError,
  component: function DeepLinkingPage() {
    const { launchId, activityCodes, userId } = Route.useLoaderData()
    return (
      <Section className="py-5 pb-2">
        <SessionIdentity domain="user" userId={userId} />
        <DeepLinkingForm launchId={launchId} activityCodes={activityCodes} />
      </Section>
    )
  },
})
