import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'

/** Learner password sign-in (surface-only: there is no session yet). */
export const signInUserFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) =>
    (await import('@/lib/session/password-sign-in.server')).signInUser(data)
  )
