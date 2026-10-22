import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'

/** Learner sign-out (surface-only, so an expired session can still sign out). */
export const signOutUserFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .handler(async () =>
    (await import('@/lib/session/password-sign-in.server')).signOutDomain('user')
  )
