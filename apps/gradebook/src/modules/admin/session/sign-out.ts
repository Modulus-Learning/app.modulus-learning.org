import { createServerFn } from '@tanstack/react-start'

import { adminSurfaceMiddleware } from '@/lib/server-fn'

/** Admin sign-out (surface-only, so an expired session can still sign out). */
export const signOutAdminFn = createServerFn({ method: 'POST' })
  .middleware([adminSurfaceMiddleware])
  .handler(async () =>
    (await import('@/lib/session/password-sign-in.server')).signOutDomain('admin')
  )
