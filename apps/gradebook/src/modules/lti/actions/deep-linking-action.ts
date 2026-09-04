'use server'

import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { readRejectedUrls, rejectedUrlsMessage } from '@/modules/app/activities/rejected-urls'
import type { DeepLinkingFormState } from '../@types'

export const deepLinking = async (
  _prevState: DeepLinkingFormState,
  formData: FormData
): Promise<DeepLinkingFormState> => {
  const log = getLogger()
  const core = await getCoreCommands()

  const validationResult = core.app.lti.handleDeepLink.schemas.input.safeParse({
    activity_url: formData.get('activity_url'),
    activity_code_id: formData.get('activity_code_id'),
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

  const ctx = await getCoreUserRequestContext()
  if (ctx == null) {
    return {
      status: 'failed',
      message: 'You must be signed in to configure this link.',
    }
  }

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

    // The sitewide allowlist refused the URL. This is a *second* code mapped
    // onto `activity_url`; without it a policy denial renders as the generic
    // "An error occurred." and the instructor is told nothing actionable.
    if (result.error.code === 'ERR_ACTIVITY_URL_NOT_ALLOWED') {
      const rejected = readRejectedUrls(result.error.details)
      if (rejected.length > 0) {
        return {
          errors: {
            activity_url: [rejectedUrlsMessage(rejected)],
          },
          message: 'Invalid activity URL.',
          status: 'failed',
        }
      }
    }

    const errorMessage =
      result.error != null && typeof result.error === 'object' && 'message' in result.error
        ? String(result.error.message)
        : 'An error occurred.'

    // The per-code `url_prefix` violation, matched on the message rather than
    // the code. Left exactly as it is: converting it to a code check is a
    // reasonable cleanup but is not part of this change.
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
