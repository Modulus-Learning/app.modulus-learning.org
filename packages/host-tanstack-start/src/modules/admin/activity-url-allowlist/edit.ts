import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './edit.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./edit.server.ts`; see `@/lib/server-action` for the envelope.

const editAllowlistRuleFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./edit.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.editAllowlistRule(...(data as Parameters<typeof Logic.editAllowlistRule>))
    )
  })

export const editAllowlistRule = async (
  ...args: Parameters<typeof Logic.editAllowlistRule>
): Promise<Awaited<ReturnType<typeof Logic.editAllowlistRule>>> =>
  followOutcome(await editAllowlistRuleFn({ data: actionEnvelope(args) }))
