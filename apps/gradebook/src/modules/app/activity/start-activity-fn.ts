import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { StartActivityResult } from './@types'

/**
 * Starts (or resumes) an activity for the current learner, for the TanStack
 * Start `start-activity` route. Surface-only: an anonymous visitor gets the
 * `needs_user` result, exactly as the Next `startActivity` action returns it.
 */
export const startActivityFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((input: { activity_code: string; activity_url: string; scope_id: string }) => input)
  .handler(async ({ data }): Promise<StartActivityResult> => {
    const { getCoreCommands, getCoreUserRequestContext } = await import('@/lib/core/start-adapter')
    const userAuth = await getCoreUserRequestContext()
    if (userAuth == null) return { status: 'needs_user', message: 'Needs user.' }

    const core = await getCoreCommands()
    const result = await core.app.activities.startActivity(userAuth, data)
    if (!result.ok) {
      if (result.error.code === 'ERR_VALIDATION') {
        return { status: 'failed', message: 'Missing or invalid fields in form.' }
      }
      if (result.error.code === 'ERR_LEARNER_NOT_FOUND') {
        return { status: 'failed', message: 'Learner not found for activity.' }
      }
      return { status: 'failed', message: 'Error starting activity' }
    }
    return { status: 'success', message: 'Activity started successfully.', data: result.data }
  })
