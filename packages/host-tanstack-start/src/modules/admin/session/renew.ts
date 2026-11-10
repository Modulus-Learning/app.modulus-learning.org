import { createServerFn } from '@tanstack/react-start'

import { adminSurfaceMiddleware } from '@/lib/server-fn'
import type { RenewalOutcome } from '@/lib/session/renewal'

/**
 * Explicit admin-session renewal (spec: Authentication And Sessions, item 2).
 * Surface-only, so an expired session can reach it, and never wrapped by the
 * renewal boundary. CSRF-protected by the global request middleware. Called
 * only through the browser coordination queue (`@/lib/session/browser-renewal`).
 */
export const renewAdminSession = createServerFn({ method: 'POST' })
  .middleware([adminSurfaceMiddleware])
  .handler(async (): Promise<RenewalOutcome> => (await import('./renew.server')).renew())
