import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './request-activity-code.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./request-activity-code.server.ts`; see `@/lib/server-action` for the envelope.

const requestActivityCodeFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./request-activity-code.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.requestActivityCode(...(data as Parameters<typeof Logic.requestActivityCode>))
    )
  })

export const requestActivityCode = async (
  ...args: Parameters<typeof Logic.requestActivityCode>
): Promise<Awaited<ReturnType<typeof Logic.requestActivityCode>>> =>
  followOutcome(await requestActivityCodeFn({ data: actionEnvelope(args) }))
