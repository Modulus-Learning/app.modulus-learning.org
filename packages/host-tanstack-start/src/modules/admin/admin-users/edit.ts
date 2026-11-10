import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './edit.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./edit.server.ts`; see `@/lib/server-action` for the envelope.

const editAdminUserFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./edit.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.editAdminUser(...(data as Parameters<typeof Logic.editAdminUser>)))
  })

export const editAdminUser = async (
  ...args: Parameters<typeof Logic.editAdminUser>
): Promise<Awaited<ReturnType<typeof Logic.editAdminUser>>> =>
  followOutcome(await editAdminUserFn({ data: actionEnvelope(args) }))
