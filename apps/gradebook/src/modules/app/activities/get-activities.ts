import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { Activity, ActivityCode } from './@types'

export async function getActivities(
  id: string
): Promise<{ activity_code: ActivityCode | null; activities: Activity[] }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    throw new Error('Unauthenticated')
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.getActivitiesByActivityCodeId(userAuth, id)

  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in getActivities',
        method: 'getActivities',
        error: result.error,
      },
    })

    // TODO: Return a failure code / status to the client?
    return { activity_code: null, activities: [] }
  }

  return result.data
}
