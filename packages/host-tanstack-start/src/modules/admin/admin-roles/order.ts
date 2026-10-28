import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './order.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./order.server.ts`; see `@/lib/server-action` for the envelope.

const orderAdminRolesFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./order.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.orderAdminRoles(...(data as Parameters<typeof Logic.orderAdminRoles>))
    )
  })

export const orderAdminRoles = async (
  ...args: Parameters<typeof Logic.orderAdminRoles>
): Promise<Awaited<ReturnType<typeof Logic.orderAdminRoles>>> =>
  followOutcome(await orderAdminRolesFn({ data: actionEnvelope(args) }))
