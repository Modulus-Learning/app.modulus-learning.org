import type { SessionDomain } from '@/lib/session/principal'
import type { RenewalOutcome } from '@/lib/session/renewal'

/**
 * The session decision behind the protected layouts' `beforeLoad` (learner
 * `_auth`, admin `_authed`), kept free of router imports so it can be tested
 * directly (spec: Authentication And Sessions, item 5).
 *
 * - A valid session continues.
 * - An expired but renewable session renews: on a server render through the
 *   bootstrap page (`ssr-recovery`); on client navigation in the browser,
 *   through the coordination queue.
 * - A renewal that fails for a transient reason (network, 5xx) throws
 *   `SessionRenewalUnavailable`: the layout shows a manual retry, never the
 *   sign-in page, and no cookie is touched.
 * - A terminal failure, or no session at all, is `anonymous` (sign-in).
 */

export class SessionRenewalUnavailable extends Error {
  readonly domain: SessionDomain
  constructor(domain: SessionDomain) {
    super(`${domain} session renewal is temporarily unavailable`)
    this.name = 'SessionRenewalUnavailable'
    this.domain = domain
  }
}

export interface SessionSnapshot<TSession> {
  session: TSession | null
  renewable: boolean
}

export type GuardDecision<TSession> =
  | { kind: 'session'; session: TSession }
  | { kind: 'anonymous' }
  | { kind: 'ssr-recovery' }

export const resolveGuardedSession = async <TSession>(args: {
  domain: SessionDomain
  load: () => Promise<SessionSnapshot<TSession>>
  renew: () => Promise<RenewalOutcome>
  isServer: boolean
}): Promise<GuardDecision<TSession>> => {
  let snapshot = await args.load()
  if (snapshot.session == null && snapshot.renewable) {
    if (args.isServer) return { kind: 'ssr-recovery' }
    const outcome = await args.renew()
    if (outcome.status === 'transient') throw new SessionRenewalUnavailable(args.domain)
    if (outcome.status === 'renewed' || outcome.status === 'unchanged') {
      snapshot = await args.load()
    }
  }
  return snapshot.session == null
    ? { kind: 'anonymous' }
    : { kind: 'session', session: snapshot.session }
}
