import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { ActivityCodeMember } from './@types'

export async function removeActivityCodeMember(
  activity_code_id: string,
  user_id: string
): Promise<{ members: ActivityCodeMember[]; error?: string }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return { members: [], error: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.removeActivityCodeMember(userAuth, {
    activity_code_id,
    user_id,
  })
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in removeActivityCodeMember',
        method: 'removeActivityCodeMember',
        error: result.error,
      },
    })
    return { members: [], error: 'There was an error removing the member.' }
  }

  return { members: result.data }
}
