'use server'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import type { ActivityCodeRequestFormState } from './@types'

export const requestActivityCode = async (
  _prevState: ActivityCodeRequestFormState,
  _formData: FormData
): Promise<ActivityCodeRequestFormState> => {
  // TODO: Logging.

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    // TODO: Better way to handle this?  Throw an error?
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const core = await getCoreCommands()
  const result = await core.app.activities.generateUniqueActivityCode(userAuth)

  if (!result.ok) {
    return {
      errors: {},
      message: 'There was an error submitting your activity code.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Activity code successfully requested.',
    status: 'success',
    code: result.data,
  }
}
