import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { RenewalOutcome } from '@/lib/session/renewal'

/**
 * Explicit learner-session renewal (spec: Authentication And Sessions, item 2).
 * Surface-only, so an expired session can reach it, and never wrapped by the
 * renewal boundary. CSRF-protected by the global request middleware. Called
 * only through the browser coordination queue (`@/lib/session/browser-renewal`).
 */
export const renewUserSession = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .handler(async (): Promise<RenewalOutcome> => (await import('./renew.server')).renew())
