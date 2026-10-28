import { coordinateAuthAction, renewSingleFlight } from './coordination'
import type { SessionDomain } from './principal'
import type { RenewalOutcome } from './renewal'

/**
 * One coordinated renewal from the browser: single-flight per domain, inside
 * the auth-action queue. The renewal server functions are loaded lazily —
 * they are built from the server-function factories, which import this module.
 */
const renewers: Record<SessionDomain, () => Promise<RenewalOutcome>> = {
  user: async () => (await import('@/modules/app/session/renew')).renewUserSession(),
  admin: async () => (await import('@/modules/admin/session/renew')).renewAdminSession(),
}

export const renewInBrowser = (domain: SessionDomain): Promise<RenewalOutcome> =>
  renewSingleFlight(domain, () =>
    coordinateAuthAction(domain, async () => {
      try {
        return await renewers[domain]()
      } catch {
        // A network failure or an unexpected server error: worth a manual retry.
        return { status: 'transient' } as const
      }
    })
  )
