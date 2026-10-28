import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

import { getActivityLaunchViewFn } from '@/modules/app/activity/activity-launch-view-fn'
import { getUserSessionFn } from '@/modules/app/session/session-state'
import type { RouteParams } from '@/lib/route-params'

/**
 * The LTI launch interstitial (`/lti/launch/<activity_id>?scope_id=…`), shown
 * when `LTI_LAUNCH_INTERSTITIAL=always` (see `docs/DEPLOYMENT.md`).
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    validateSearch: z.object({ scope_id: z.string().optional() }),
    loaderDeps: ({ search }: { search: { scope_id?: string } }) => ({
      scope_id: search.scope_id,
    }),
    loader: async ({ params, deps }) => {
      const activity = z.uuid().safeParse((params as RouteParams).activity_id)
      const scope = z.uuid().safeParse(deps.scope_id)
      if (!activity.success || !scope.success) return { kind: 'invalid' as const }

      const [result, { session }] = await Promise.all([
        getActivityLaunchViewFn({ data: { activity_id: activity.data, scope_id: scope.data } }),
        getUserSessionFn(),
      ])
      return { kind: 'result' as const, result, session }
    },
    component: lazyRouteComponent(() => import('./$activity_id.page'), 'Page'),
  })
  return Route
}
