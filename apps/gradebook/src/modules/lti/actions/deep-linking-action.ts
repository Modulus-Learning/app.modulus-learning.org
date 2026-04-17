'use server'

import { z } from 'zod'

import { getCoreInstance, getCoreRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import type { DeepLinkingFormState } from '../@types'

export const deepLinking = async (
  _prevState: DeepLinkingFormState,
  formData: FormData
): Promise<DeepLinkingFormState> => {
  const log = getLogger()
  const core = await getCoreInstance()

  const validationResult = core.app.lti.handleDeepLink.schemas.input.safeParse({
    activity_url: formData.get('activity_url'),
    activity_code: formData.get('activity_code'),
    launch_id: formData.get('launch_id'),
  })
  if (!validationResult.success) {
    // TODO: Log this?
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields.',
      status: 'failed',
    }
  }

  const ctx = await getCoreRequestContext()
  const result = await core.app.lti.handleDeepLink(ctx, validationResult.data)
  if (!result.ok) {
    log.error({
      deep_link: {
        status: 'failed',
        message: 'error in deep linking',
        method: 'deepLinking',
        error: result.error,
      },
    })

    const errorMessage =
      result.error != null && typeof result.error === 'object' && 'message' in result.error
        ? String(result.error.message)
        : 'An error occurred.'

    if (/activity url must start with/i.test(errorMessage)) {
      return {
        errors: {
          activity_url: [errorMessage],
        },
        message: 'Invalid activity URL.',
        status: 'failed',
      }
    }

    return {
      status: 'failed',
      message: 'An error occurred.',
    }
  }

  const { jwt, return_url } = result.data
  return {
    status: 'success',
    result: { jwt, return_url },
  }
}
