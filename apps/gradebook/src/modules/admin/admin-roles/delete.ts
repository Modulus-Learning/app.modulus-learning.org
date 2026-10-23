import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './delete.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./delete.server.ts`; see `@/lib/server-action` for the envelope.

const deleteAdminRoleFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./delete.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.deleteAdminRole(...(data as Parameters<typeof Logic.deleteAdminRole>))
    )
  })

export const deleteAdminRole = async (
  ...args: Parameters<typeof Logic.deleteAdminRole>
): Promise<Awaited<ReturnType<typeof Logic.deleteAdminRole>>> =>
  followOutcome(await deleteAdminRoleFn({ data: actionEnvelope(args) }))
