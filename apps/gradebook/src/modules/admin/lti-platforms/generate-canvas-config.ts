import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './generate-canvas-config.server'

// Form-action server functions behind the admin session gate: the logic is
// in `./generate-canvas-config.server.ts`; see `@/lib/server-action` for the envelope.

const generateCanvasConfigFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./generate-canvas-config.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.generateCanvasConfig(...(data as Parameters<typeof Logic.generateCanvasConfig>))
    )
  })

export const generateCanvasConfig = async (
  ...args: Parameters<typeof Logic.generateCanvasConfig>
): Promise<Awaited<ReturnType<typeof Logic.generateCanvasConfig>>> =>
  followOutcome(await generateCanvasConfigFn({ data: actionEnvelope(args) }))
