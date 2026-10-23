import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { InstructorSearchResult } from './@types'

export async function searchInstructors(
  activity_code_id: string,
  query: string
): Promise<{ results: InstructorSearchResult[] }> {
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    throw new Error('Unauthenticated')
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.searchInstructors(userAuth, {
    activity_code_id,
    query,
  })
  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in searchInstructors',
        method: 'searchInstructors',
        error: result.error,
      },
    })
    return { results: [] }
  }

  return { results: result.data }
}
