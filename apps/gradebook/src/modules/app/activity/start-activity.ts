'use server'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import type { StartActivityResult } from './@types'

export async function startActivity(
  activity_code: string,
  activity_url: string
): Promise<StartActivityResult> {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return { status: 'needs_user', message: 'Needs user.' }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.startActivity(userAuth, {
    activity_code,
    activity_url,
  })

  if (!result.ok) {
    if (result.error.code === 'ERR_VALIDATION') {
      return {
        message: 'Missing or invalid fields in form.',
        status: 'failed',
      }
    }

    if (result.error.code === 'ERR_LEARNER_NOT_FOUND') {
      return {
        status: 'failed',
        message: 'Learner not found for activity.',
      }
    }

    return {
      status: 'failed',
      message: 'Error starting activity',
    }
  }

  return {
    status: 'success',
    message: 'Activity started successfully.',
    data: result.data,
  }
}
