import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { ActivityLaunchViewResult } from './@types'

/**
 * The LTI interstitial's display data (read-only; the launch already
 * enrolled the learner). Surface-only: an anonymous visitor gets `needs_user`,
 * as the Next `getActivityLaunchView` action returns it.
 */
export const getActivityLaunchViewFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .validator((input: { activity_id: string; scope_id: string }) => input)
  .handler(async ({ data }): Promise<ActivityLaunchViewResult> => {
    const { getCoreCommands, getCoreUserRequestContext } = await import('@/lib/core/start-adapter')
    const userAuth = await getCoreUserRequestContext()
    if (userAuth == null) return { status: 'needs_user', message: 'Needs user.' }
    const core = await getCoreCommands()
    const result = await core.app.activities.getActivityLaunchView(userAuth, data)
    if (!result.ok) {
      if (result.error.code === 'ERR_VALIDATION') {
        return { status: 'failed', message: 'Missing or invalid activity parameters.' }
      }
      if (result.error.code === 'ERR_LEARNER_NOT_FOUND') {
        return { status: 'failed', message: 'Learner not found for activity.' }
      }
      return { status: 'failed', message: 'Error launching activity' }
    }
    return { status: 'success', message: 'Activity launch view resolved.', data: result.data }
  })
