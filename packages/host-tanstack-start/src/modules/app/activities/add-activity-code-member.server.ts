import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { ActivityCodeMember } from './@types'

export async function addActivityCodeMember(
  activity_code_id: string,
  user_id: string
): Promise<{ members: ActivityCodeMember[]; error?: string }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return { members: [], error: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.addActivityCodeMember(userAuth, {
    activity_code_id,
    user_id,
  })
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in addActivityCodeMember',
        method: 'addActivityCodeMember',
        error: result.error,
      },
    })
    const reason =
      result.error?.code === 'ERR_USER_NOT_INSTRUCTOR'
        ? 'Only instructors can be added as members.'
        : 'There was an error adding the member.'
    return { members: [], error: reason }
  }

  return { members: result.data }
}
