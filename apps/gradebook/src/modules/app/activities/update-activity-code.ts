'use server'

import { redirect } from 'next/navigation'

import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { validateUrlPrefix, validateUrls } from './@types/validate-urls'
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

  const id = formData.get('id') as string | null
  const urls = formData.get('urls') as string | null
  const urlPrefix = formData.get('url_prefix') as string | null

  if (id == null || typeof id !== 'string') {
    return {
      errors: {},
      message: 'Invalid activity code id.',
      status: 'failed',
    }
  }

  if (urls != null && typeof urls !== 'string') {
    return {
      errors: { urls: ['URLs must be a string.'] },
      message: 'Invalid URLs.',
      status: 'failed',
    }
  }

  if (urlPrefix != null && typeof urlPrefix !== 'string') {
    return {
      errors: { url_prefix: ['URL prefix must be a string.'] },
      message: 'Invalid URL prefix.',
      status: 'failed',
    }
  }

  const normalizedUrlPrefix = urlPrefix?.trim() ?? ''
  const prefixValidationResult = validateUrlPrefix(normalizedUrlPrefix)
  if (prefixValidationResult.valid === false) {
    return {
      errors: { url_prefix: [prefixValidationResult.message] },
      message: 'Invalid URL prefix.',
      status: 'failed',
    }
  }

  const urlsArray = (urls ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  if (urlsArray.length > 0) {
    const urlValidationResult = validateUrls(urlsArray, normalizedUrlPrefix)
    if (urlValidationResult.valid === false) {
      return {
        errors: { urls: [urlValidationResult.message] },
        message: 'Invalid URLs.',
        status: 'failed',
      }
    }
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.updateActivityCode(userAuth, {
    id,
    url_prefix: normalizedUrlPrefix === '' ? null : normalizedUrlPrefix,
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

  redirect(`/dashboard/activity-code/${id}/activities`)
}
