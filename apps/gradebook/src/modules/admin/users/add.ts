import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './add.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./add.server.ts`; see `@/lib/server-action` for the envelope.

const addUserFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./add.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.addUser(...(data as Parameters<typeof Logic.addUser>)))
  })

export const addUser = async (
  ...args: Parameters<typeof Logic.addUser>
): Promise<Awaited<ReturnType<typeof Logic.addUser>>> =>
  followOutcome(await addUserFn({ data: actionEnvelope(args) }))
