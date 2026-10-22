import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { DeepLinkingFormState } from '../@types'

/**
 * TanStack Start override of `./deep-linking-action.ts`. Surface-only (not
 * `appSessionMiddleware`): the shared logic answers a missing session with its
 * own "you must be signed in" form state, which the form displays.
 */
const deepLinkingFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<DeepLinkingFormState> => {
    const [{ runDeepLinking }, adapter, { getServerLogger }] = await Promise.all([
      import('./deep-linking.logic'),
      import('@/lib/core/start-adapter'),
      import('@/lib/server-logger'),
    ])
    return runDeepLinking({
      core: await adapter.getCoreCommands(),
      ctx: await adapter.getCoreUserRequestContext(),
      log: getServerLogger(),
      formData: data,
    })
  })

export const deepLinking = async (
  _prevState: DeepLinkingFormState,
  formData: FormData
): Promise<DeepLinkingFormState> => deepLinkingFn({ data: formData })
