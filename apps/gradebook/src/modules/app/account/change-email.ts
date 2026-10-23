import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './change-email.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./change-email.server.ts`; see `@/lib/server-action` for the envelope.

const changeEmailFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./change-email.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.changeEmail(...(data as Parameters<typeof Logic.changeEmail>)))
  })

export const changeEmail = async (
  ...args: Parameters<typeof Logic.changeEmail>
): Promise<Awaited<ReturnType<typeof Logic.changeEmail>>> =>
  followOutcome(await changeEmailFn({ data: actionEnvelope(args) }))

const verifyEmailFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./change-email.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.verifyEmail(...(data as Parameters<typeof Logic.verifyEmail>)))
  })

export const verifyEmail = async (
  ...args: Parameters<typeof Logic.verifyEmail>
): Promise<Awaited<ReturnType<typeof Logic.verifyEmail>>> =>
  followOutcome(await verifyEmailFn({ data: actionEnvelope(args) }))
