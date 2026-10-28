import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { redirect } from '@/lib/server-request'

export async function deleteActivityCode(activity_code_id: string): Promise<{ error?: string }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return { error: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.deleteActivityCode(userAuth, activity_code_id)
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in deleteActivityCode',
        method: 'deleteActivityCode',
        error: result.error,
      },
    })
    return { error: 'There was an error deleting the activity code.' }
  }

  redirect('/dashboard')
}
