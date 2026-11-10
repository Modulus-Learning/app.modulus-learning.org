import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './order.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./order.server.ts`; see `@/lib/server-action` for the envelope.

const orderRolesFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./order.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() => logic.orderRoles(...(data as Parameters<typeof Logic.orderRoles>)))
  })

export const orderRoles = async (
  ...args: Parameters<typeof Logic.orderRoles>
): Promise<Awaited<ReturnType<typeof Logic.orderRoles>>> =>
  followOutcome(await orderRolesFn({ data: actionEnvelope(args) }))
