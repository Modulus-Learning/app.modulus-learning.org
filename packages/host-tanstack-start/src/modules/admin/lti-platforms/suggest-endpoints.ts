import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './suggest-endpoints.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./suggest-endpoints.server.ts`; see `@/lib/server-action` for the envelope.

const suggestLtiPlatformEndpointsFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./suggest-endpoints.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.suggestLtiPlatformEndpoints(
        ...(data as Parameters<typeof Logic.suggestLtiPlatformEndpoints>)
      )
    )
  })

export const suggestLtiPlatformEndpoints = async (
  ...args: Parameters<typeof Logic.suggestLtiPlatformEndpoints>
): Promise<Awaited<ReturnType<typeof Logic.suggestLtiPlatformEndpoints>>> =>
  followOutcome(await suggestLtiPlatformEndpointsFn({ data: actionEnvelope(args) }))
