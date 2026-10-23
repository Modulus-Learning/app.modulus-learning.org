import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './change-password.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./change-password.server.ts`; see `@/lib/server-action` for the envelope.

const changePasswordFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./change-password.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.changePassword(...(data as Parameters<typeof Logic.changePassword>))
    )
  })

export const changePassword = async (
  ...args: Parameters<typeof Logic.changePassword>
): Promise<Awaited<ReturnType<typeof Logic.changePassword>>> =>
  followOutcome(await changePasswordFn({ data: actionEnvelope(args) }))
