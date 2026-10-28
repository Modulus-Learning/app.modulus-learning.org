import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './create-activity-code.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./create-activity-code.server.ts`; see `@/lib/server-action` for the envelope.

const createActivityCodeFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./create-activity-code.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.createActivityCode(...(data as Parameters<typeof Logic.createActivityCode>))
    )
  })

export const createActivityCode = async (
  ...args: Parameters<typeof Logic.createActivityCode>
): Promise<Awaited<ReturnType<typeof Logic.createActivityCode>>> =>
  followOutcome(await createActivityCodeFn({ data: actionEnvelope(args) }))
