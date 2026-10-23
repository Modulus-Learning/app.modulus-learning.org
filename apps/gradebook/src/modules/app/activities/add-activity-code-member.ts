import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './add-activity-code-member.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./add-activity-code-member.server.ts`; see `@/lib/server-action` for the envelope.

const addActivityCodeMemberFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./add-activity-code-member.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.addActivityCodeMember(...(data as Parameters<typeof Logic.addActivityCodeMember>))
    )
  })

export const addActivityCodeMember = async (
  ...args: Parameters<typeof Logic.addActivityCodeMember>
): Promise<Awaited<ReturnType<typeof Logic.addActivityCodeMember>>> =>
  followOutcome(await addActivityCodeMemberFn({ data: actionEnvelope(args) }))
