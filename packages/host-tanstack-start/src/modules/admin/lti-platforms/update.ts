import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './update.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./update.server.ts`; see `@/lib/server-action` for the envelope.

const updateLtiPlatformFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./update.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.updateLtiPlatform(...(data as Parameters<typeof Logic.updateLtiPlatform>))
    )
  })

export const updateLtiPlatform = async (
  ...args: Parameters<typeof Logic.updateLtiPlatform>
): Promise<Awaited<ReturnType<typeof Logic.updateLtiPlatform>>> =>
  followOutcome(await updateLtiPlatformFn({ data: actionEnvelope(args) }))
