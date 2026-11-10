import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './preview.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./preview.server.ts`; see `@/lib/server-action` for the envelope.

const previewAllowlistImpactFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./preview.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.previewAllowlistImpact(...(data as Parameters<typeof Logic.previewAllowlistImpact>))
    )
  })

export const previewAllowlistImpact = async (
  ...args: Parameters<typeof Logic.previewAllowlistImpact>
): Promise<Awaited<ReturnType<typeof Logic.previewAllowlistImpact>>> =>
  followOutcome(await previewAllowlistImpactFn({ data: actionEnvelope(args) }))
