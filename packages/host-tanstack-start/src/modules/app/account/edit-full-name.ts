import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './edit-full-name.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./edit-full-name.server.ts`; see `@/lib/server-action` for the envelope.

const editFullNameFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./edit-full-name.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.editFullName(...(data as Parameters<typeof Logic.editFullName>)))
  })

export const editFullName = async (
  ...args: Parameters<typeof Logic.editFullName>
): Promise<Awaited<ReturnType<typeof Logic.editFullName>>> =>
  followOutcome(await editFullNameFn({ data: actionEnvelope(args) }))
