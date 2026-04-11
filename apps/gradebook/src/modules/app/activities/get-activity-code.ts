import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { ActivityCode } from './@types'

export async function getActivityCode(
  private_code: string
): Promise<{ activity_code: ActivityCode | null }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    throw new Error('Unauthenticated')
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.getActivityCodeByPrivateCode(userAuth, private_code)
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in getActivityCode',
        method: 'getActivityCode',
        error: result.error,
      },
    })
    return { activity_code: null }
  }

  return { activity_code: result.data }
}
