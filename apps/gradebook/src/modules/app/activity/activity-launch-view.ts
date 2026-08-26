'use server'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import type { ActivityLaunchViewResult } from './@types'

/**
 * Resolves the LTI interstitial's display data for one `(activity_id,
 * scope_id)` pair.
 *
 * The mirror of `startActivity` for the LTI path, and read-only: the launch
 * handler has already enrolled the learner, so this must not enroll again. It
 * takes no activity code for the same reason -- see `ActivityLaunchViewService`
 * in core.
 */
export async function getActivityLaunchView(
  activity_id: string,
  scope_id: string
): Promise<ActivityLaunchViewResult> {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return { status: 'needs_user', message: 'Needs user.' }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.getActivityLaunchView(userAuth, {
    activity_id,
    scope_id,
  })

  if (!result.ok) {
    if (result.error.code === 'ERR_VALIDATION') {
      return {
        status: 'failed',
        message: 'Missing or invalid activity parameters.',
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
      message: 'Error launching activity',
    }
  }

  return {
    status: 'success',
    message: 'Activity launch view resolved.',
    data: result.data,
  }
}
