import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './set-password.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./set-password.server.ts`; see `@/lib/server-action` for the envelope.

const setPasswordFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./set-password.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.setPassword(...(data as Parameters<typeof Logic.setPassword>)))
  })

export const setPassword = async (
  ...args: Parameters<typeof Logic.setPassword>
): Promise<Awaited<ReturnType<typeof Logic.setPassword>>> =>
  followOutcome(await setPasswordFn({ data: actionEnvelope(args) }))
