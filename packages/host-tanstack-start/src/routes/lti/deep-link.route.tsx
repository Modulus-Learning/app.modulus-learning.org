import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'

import { z } from 'zod'

import { ssrRecoveryHref } from '@/lib/session/bootstrap'
import { renewInBrowser } from '@/lib/session/browser-renewal'
import { resolveGuardedSession } from '@/lib/session/route-guard'
import { SessionIdentity } from '@/lib/session/session-identity'
import { SessionGuardError } from '@/lib/session/session-retry'
import { listActivityCodesFn } from '@/modules/app/activities/activity-codes-fn'
import { getUserSessionFn } from '@/modules/app/session/session-state'

// LTI deep-linking picker (`/lti/deep-link?id=<launch id>`). The page's own
// session establishes the identity its submission must carry (review R5): an
// expired session renews here — through the bootstrap on a server render —
// before the form is shown, and `SessionIdentity` registers the principal the
// submission sends.
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    validateSearch: z.object({ id: z.string().optional() }),
    loaderDeps: ({ search }: { search: { id?: string } }) => ({ id: search.id }),
    loader: async ({ deps, location }) => {
      if (deps.id == null) throw redirect({ href: '/' })
      const decision = await resolveGuardedSession({
        domain: 'user',
        load: () => getUserSessionFn(),
        renew: () => renewInBrowser('user'),
        isServer: typeof window === 'undefined',
      })
      if (decision.kind === 'ssr-recovery') {
        throw redirect({
          href: ssrRecoveryHref('user', `${location.pathname}${location.searchStr}`),
        })
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
    component: lazyRouteComponent(() => import('./deep-link.page'), 'Page'),
  })
  return Route
}
