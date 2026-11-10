import { createServerFn } from '@tanstack/react-start'

import { adminSurfaceMiddleware } from '@/lib/server-fn'

/** Admin password sign-in (surface-only: there is no session yet). */
export const signInAdminFn = createServerFn({ method: 'POST' })
  .middleware([adminSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) =>
    (await import('@/lib/session/password-sign-in.server')).signInAdmin(data)
  )
