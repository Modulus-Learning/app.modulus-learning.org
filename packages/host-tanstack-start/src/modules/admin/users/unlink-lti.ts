import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { adminSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './unlink-lti.server'

// A form-action server function behind the admin session gate: the logic is
// in `./unlink-lti.server.ts`; see `@/lib/server-action` for the envelope.

const unlinkUserLtiIdentityFn = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./unlink-lti.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.unlinkUserLtiIdentity(...(data as Parameters<typeof Logic.unlinkUserLtiIdentity>))
    )
  })

export const unlinkUserLtiIdentity = async (
  ...args: Parameters<typeof Logic.unlinkUserLtiIdentity>
): Promise<Awaited<ReturnType<typeof Logic.unlinkUserLtiIdentity>>> =>
  followOutcome(await unlinkUserLtiIdentityFn({ data: actionEnvelope(args) }))
