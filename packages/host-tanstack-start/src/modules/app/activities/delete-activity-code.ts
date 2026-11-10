import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './delete-activity-code.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./delete-activity-code.server.ts`; see `@/lib/server-action` for the envelope.

const deleteActivityCodeFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./delete-activity-code.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.deleteActivityCode(...(data as Parameters<typeof Logic.deleteActivityCode>))
    )
  })

export const deleteActivityCode = async (
  ...args: Parameters<typeof Logic.deleteActivityCode>
): Promise<Awaited<ReturnType<typeof Logic.deleteActivityCode>>> =>
  followOutcome(await deleteActivityCodeFn({ data: actionEnvelope(args) }))
