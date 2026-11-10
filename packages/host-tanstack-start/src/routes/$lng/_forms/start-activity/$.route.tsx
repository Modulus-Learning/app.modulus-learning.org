import {
  createFileRoute,
  type FileRoutesByPath,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router'

import { localeOutputRewrite } from '@/i18n/locale-rewrite'
import { DEFAULT_SCOPE_ID } from '@/lib/default-scope'
import { ssrRecoveryHref } from '@/lib/session/bootstrap'
import { renewInBrowser } from '@/lib/session/browser-renewal'
import { resolveGuardedSession } from '@/lib/session/route-guard'
import { SessionGuardError } from '@/lib/session/session-retry'
import { extractActivityLaunchParameters } from '@/modules/app/activity/launch-url'
import { startActivityFn } from '@/modules/app/activity/start-activity-fn'
import { getUserSessionFn } from '@/modules/app/session/session-state'
import type { StartActivityResult } from '@/modules/app/activity/@types/index'

/**
 * The non-LTI activity launch: `/start-activity/<code>/<activity url…>`.
 *
 * The segments are read from the raw (still percent-encoded) path, as the Next
 * catch-all `[...go]` delivered them, rather than from the router's decoded
 * splat param: `extractActivityLaunchParameters` owns the decoding.
 */
export const createRoute = <TPath extends keyof FileRoutesByPath>(path: TPath) => {
  const Route = createFileRoute(path)({
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
    component: lazyRouteComponent(() => import('./$.page'), 'Page'),
  })
  return Route
}
