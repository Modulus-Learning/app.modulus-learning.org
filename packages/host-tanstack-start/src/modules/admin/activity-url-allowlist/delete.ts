import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './delete.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./delete.server.ts`; see `@/lib/server-action` for the envelope.

const deleteAllowlistRuleFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./delete.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.deleteAllowlistRule(...(data as Parameters<typeof Logic.deleteAllowlistRule>))
    )
  })

export const deleteAllowlistRule = async (
  ...args: Parameters<typeof Logic.deleteAllowlistRule>
): Promise<Awaited<ReturnType<typeof Logic.deleteAllowlistRule>>> =>
  followOutcome(await deleteAllowlistRuleFn({ data: actionEnvelope(args) }))
