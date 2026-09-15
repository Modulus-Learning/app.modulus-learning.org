'use server'

import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { getLogger } from '@/lib/logger'
import { DEEP_LINK_PREFIX_MESSAGES } from '@/modules/app/activities/@types/validate-urls'
import {
  readRejectedUrls,
  readValidationIssues,
  rejectedUrlsMessage,
} from '@/modules/app/activities/rejected-urls'
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
    // Every branch mapped onto a field returns ahead of the error log below
    // deliberately, as the activity-code actions do. An instructor's input is
    // not an error, and `result.error.details` can carry the whole submitted
    // URL, query and fragment included. Core has already recorded each of
    // these at warn without the URL or the stored prefix.
    switch (result.error.code) {
      case 'ERR_DEEP_LINK_PREFIX_MISMATCH':
        return {
          errors: { activity_url: [DEEP_LINK_PREFIX_MESSAGES.mismatch] },
          message: 'Invalid activity URL.',
          status: 'failed',
        }

      // The stored prefix itself is invalid. That is a problem with the
      // selected activity code, not with the URL the instructor entered.
      case 'ERR_DEEP_LINK_PREFIX_INVALID':
        return {
          errors: { activity_code_id: [DEEP_LINK_PREFIX_MESSAGES.invalid] },
          message: 'Invalid activity code.',
          status: 'failed',
        }

      case 'ERR_VALIDATION': {
        const messages = readValidationIssues(result.error.details)
          .filter(({ path }) => path[0] === 'activity_url')
          .map(({ message }) => message)
        if (messages.length > 0) {
          return {
            errors: { activity_url: [...new Set(messages)] },
            message: 'Invalid activity URL.',
            status: 'failed',
          }
        }
        break
      }

      case 'ERR_ACTIVITY_URL_NOT_ALLOWED': {
        const rejected = readRejectedUrls(result.error.details)
        if (rejected.length > 0) {
          return {
            errors: { activity_url: [rejectedUrlsMessage(rejected)] },
            message: 'Invalid activity URL.',
            status: 'failed',
          }
        }

        // A contract mismatch with core, so it is logged -- but by code
        // alone, and with a neutral message rather than a guessed reason.
        log.error({
          deep_link: {
            status: 'failed',
            message: 'unreadable activity url denial in deep linking',
            method: 'deepLinking',
            code: result.error.code,
          },
        })
        return {
          status: 'failed',
          message: 'An error occurred.',
        }
      }
    }

    log.error({
      deep_link: {
        status: 'failed',
        message: 'error in deep linking',
        method: 'deepLinking',
        error: result.error,
      },
    })

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
