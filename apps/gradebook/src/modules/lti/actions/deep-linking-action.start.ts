import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import {
  SessionChangedError,
  SessionEndedError,
  SessionRenewedRetryError,
} from '@/lib/session/replay'
import type { DeepLinkingFormState } from '../@types'

/**
 * TanStack Start override of `./deep-linking-action.ts`. Behind the learner
 * session gate (review R5): the renewal boundary renews an expired session and
 * replays the submission, and the page's expected principal — registered by
 * `/lti/deep-link` from its own session — must match, all before the handler
 * runs. The handler acts on the verified session (`context.core`).
 */
const deepLinkingFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data, context }): Promise<DeepLinkingFormState> => {
    const [{ runDeepLinking }, { getCoreCommands }, { getServerLogger }] = await Promise.all([
      import('./deep-linking.logic'),
      import('@/lib/core/start-adapter'),
      import('@/lib/server-logger'),
    ])
    return runDeepLinking({
      core: await getCoreCommands(),
      ctx: context.core,
      log: getServerLogger(),
      formData: data,
    })
  })

const SIGNED_OUT: DeepLinkingFormState = {
  errors: {},
  message: 'You must be signed in to configure this link.',
  status: 'failed',
}

/**
 * The form action. Session outcomes that stop the submission before its
 * handler runs come back as form states: no session (401), a session that
 * ended or could not be renewed, or a different account.
 */
export const deepLinking = async (
  _prevState: DeepLinkingFormState,
  formData: FormData
): Promise<DeepLinkingFormState> => {
  try {
    return await deepLinkingFn({ data: formData })
  } catch (error) {
    if (
      error instanceof SessionChangedError ||
      error instanceof SessionEndedError ||
      error instanceof SessionRenewedRetryError
    ) {
      return { errors: {}, message: error.message, status: 'failed' }
    }
    if (error instanceof Response && error.status === 401) return SIGNED_OUT
    throw error
  }
}
