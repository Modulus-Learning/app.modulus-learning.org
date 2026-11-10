import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './add.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./add.server.ts`; see `@/lib/server-action` for the envelope.

const addAdminUserFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./add.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.addAdminUser(...(data as Parameters<typeof Logic.addAdminUser>)))
  })

export const addAdminUser = async (
  ...args: Parameters<typeof Logic.addAdminUser>
): Promise<Awaited<ReturnType<typeof Logic.addAdminUser>>> =>
  followOutcome(await addAdminUserFn({ data: actionEnvelope(args) }))
