import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './create.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./create.server.ts`; see `@/lib/server-action` for the envelope.

const createLtiPlatformFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./create.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.createLtiPlatform(...(data as Parameters<typeof Logic.createLtiPlatform>))
    )
  })

export const createLtiPlatform = async (
  ...args: Parameters<typeof Logic.createLtiPlatform>
): Promise<Awaited<ReturnType<typeof Logic.createLtiPlatform>>> =>
  followOutcome(await createLtiPlatformFn({ data: actionEnvelope(args) }))
