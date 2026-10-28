import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { ActivityCode } from './@types'

/**
 * The signed-in instructor's activity codes, for the LTI deep-linking page.
 * Returns null without a session; the page treats that as the Next page's
 * "Unauthenticated" error.
 */
export const listActivityCodesFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .handler(async (): Promise<{ activity_codes: ActivityCode[] } | null> => {
    const [{ getCoreCommands, getCoreUserRequestContext }, { getServerLogger }] = await Promise.all(
      [import('@/lib/core/start-adapter'), import('@/lib/server-logger')]
    )
    const userAuth = await getCoreUserRequestContext()
    if (userAuth == null) return null
    const core = await getCoreCommands()
    const result = await core.app.activities.listActivityCodes(userAuth)
    if (!result.ok) {
      getServerLogger().error({
        activities: {
          status: 'failed',
          message: 'error in listActivityCodes',
          error: result.error,
        },
      })
      return { activity_codes: [] }
    }
    return { activity_codes: result.data }
  })
