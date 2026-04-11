'use server'

import { redirect } from 'next/navigation'

import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { validateUrls } from './@types/validate-urls'
import type { ActivityCodeFormState } from './@types'

export const updateActivityCode = async (
  _prevState: ActivityCodeFormState,
  formData: FormData
): Promise<ActivityCodeFormState> => {
  // TODO: Logging.
  const logger = getLogger()

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const private_code = formData.get('private_code') as string | null
  const urls = formData.get('urls') as string | null

  if (private_code == null || typeof private_code !== 'string') {
    return {
      errors: {},
      message: 'Invalid private code.',
      status: 'failed',
    }
  }

  if (urls == null || typeof urls !== 'string') {
    return {
      errors: { urls: ['URLs are required.'] },
      message: 'Invalid URLs.',
      status: 'failed',
    }
  }

  const urlsArray = urls
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const urlValidationResult = validateUrls(urlsArray)
  if (urlValidationResult.valid === false) {
    return {
      errors: { urls: [urlValidationResult.message] },
      message: 'Invalid URLs.',
      status: 'failed',
    }
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.updateActivityCode(userAuth, {
    private_code,
    urls: urlsArray,
  })

  if (!result.ok) {
    logger.error({
      activities: {
        status: 'failed',
        message: 'error in updateActivityCode',
        method: 'updateActivityCode',
        error: result.error,
      },
    })
    return {
      errors: {},
      message: 'There was an error updating your activity code.',
      status: 'failed',
    }
  }

  redirect(`/dashboard/activity-code/${private_code}/activities`)
}
