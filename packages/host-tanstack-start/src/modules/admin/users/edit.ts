import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './edit.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./edit.server.ts`; see `@/lib/server-action` for the envelope.

const editUserFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./edit.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.editUser(...(data as Parameters<typeof Logic.editUser>)))
  })

export const editUser = async (
  ...args: Parameters<typeof Logic.editUser>
): Promise<Awaited<ReturnType<typeof Logic.editUser>>> =>
  followOutcome(await editUserFn({ data: actionEnvelope(args) }))
