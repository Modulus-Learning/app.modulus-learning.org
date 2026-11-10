import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getServerLogger } from '@/lib/server-logger'
import type { ActivityCode } from './@types'

// TODO: implement standard API response object, including paged list
// responses etc.
export async function getActivityCodes(): Promise<{ activity_codes: ActivityCode[] }> {
  const logger = getServerLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    throw new Error('Unauthenticated')
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.listActivityCodes(userAuth)
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in getActivityCodes',
        method: 'getActivityCodes',
        error: result.error,
      },
    })

    // TODO: Return a failure code / status to the client?
    return { activity_codes: [] }
  }

  return { activity_codes: result.data }
}
