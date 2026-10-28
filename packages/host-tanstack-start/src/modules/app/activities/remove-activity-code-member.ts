import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './remove-activity-code-member.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./remove-activity-code-member.server.ts`; see `@/lib/server-action` for the envelope.

const removeActivityCodeMemberFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./remove-activity-code-member.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.removeActivityCodeMember(...(data as Parameters<typeof Logic.removeActivityCodeMember>))
    )
  })

export const removeActivityCodeMember = async (
  ...args: Parameters<typeof Logic.removeActivityCodeMember>
): Promise<Awaited<ReturnType<typeof Logic.removeActivityCodeMember>>> =>
  followOutcome(await removeActivityCodeMemberFn({ data: actionEnvelope(args) }))
