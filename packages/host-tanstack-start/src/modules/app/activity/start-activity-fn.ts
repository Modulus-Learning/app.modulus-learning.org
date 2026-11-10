import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import type { StartActivityResult } from './@types'

/**
 * Starts (or resumes) an activity for the signed-in learner, for the TanStack
 * Start `start-activity` route. Behind the learner session gate (review R5):
 * the route decides anonymous (`needs_user`) and renewable sessions before it
 * calls this, and a remote call must name the page's principal.
 */
export const startActivityFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((input: { activity_code: string; activity_url: string; scope_id: string }) => input)
  .handler(async ({ data, context }): Promise<StartActivityResult> => {
    const { getCoreCommands } = await import('@/lib/core/start-adapter')
    const core = await getCoreCommands()
    const result = await core.app.activities.startActivity(context.core, data)
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
