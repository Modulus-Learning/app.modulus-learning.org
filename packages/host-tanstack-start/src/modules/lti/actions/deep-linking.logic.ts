import type { CoreCommands, UserRequestContext } from '@modulus-learning/core'
import type { Logger } from 'pino'
import { z } from 'zod'

import { readRejectedUrls, rejectedUrlsMessage } from '@/modules/app/activities/rejected-urls'
import type { DeepLinkingFormState } from '../@types'

/**
 * Framework-neutral deep-linking submission, shared by the Next server action
 * (`./deep-linking-action.ts`) and the TanStack Start server function
 * (`./deep-linking-action.start.ts`). Each host supplies core, the learner
 * context (or undefined) and its logger.
 */
export const runDeepLinking = async ({
  core,
  ctx,
  log,
  formData,
}: {
  core: CoreCommands
  ctx: UserRequestContext | undefined
  log: Pick<Logger, 'error'>
  formData: FormData
}): Promise<DeepLinkingFormState> => {
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

  if (ctx == null) {
    return {
      status: 'failed',
      message: 'You must be signed in to configure this link.',
    }
  }

  const result = await core.app.lti.handleDeepLink(ctx, validationResult.data)
  if (!result.ok) {
    // The sitewide allowlist refused the URL. This is a *second* code mapped
    // onto `activity_url`; without it a policy denial renders as the generic
    // "An error occurred." and the instructor is told nothing actionable.
    //
    // It returns ahead of the error log below deliberately, as the
    // activity-code actions do. `result.error.details` carries the whole URL,
    // query and fragment included, and an instructor typo is not an error
    // anyway -- core has already recorded the denial at warn, with the
    // normalized origin and path alone.
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
