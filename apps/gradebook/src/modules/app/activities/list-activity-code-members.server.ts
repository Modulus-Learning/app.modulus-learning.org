import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { ActivityCodeMember } from './@types'

export async function listActivityCodeMembers(
  activity_code_id: string
): Promise<{ members: ActivityCodeMember[] }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    throw new Error('Unauthenticated')
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.listActivityCodeMembers(userAuth, activity_code_id)
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in listActivityCodeMembers',
        method: 'listActivityCodeMembers',
        error: result.error,
      },
    })
    return { members: [] }
  }

  return { members: result.data }
}
