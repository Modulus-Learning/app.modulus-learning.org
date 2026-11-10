import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './update-activity-code.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./update-activity-code.server.ts`; see `@/lib/server-action` for the envelope.

const updateActivityCodeFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./update-activity-code.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.updateActivityCode(...(data as Parameters<typeof Logic.updateActivityCode>))
    )
  })

export const updateActivityCode = async (
  ...args: Parameters<typeof Logic.updateActivityCode>
): Promise<Awaited<ReturnType<typeof Logic.updateActivityCode>>> =>
  followOutcome(await updateActivityCodeFn({ data: actionEnvelope(args) }))
