import { type Principal, samePrincipal } from './principal'
import type { SessionState } from './state'

/**
 * The renewal boundary's server-side decision (spec: Authentication And
 * Sessions, items 4 and 7). It runs in `appFn` / `adminFn` middleware BEFORE
 * the handler, so a `renew` or `changed` outcome proves the handler never ran.
 *
 * - `renew`        — expired but renewable: the client may renew and replay.
 * - `changed`      — the verified principal is not the one the page expects.
 * - `unauthorized` — no session at all; an ordinary 401, never replayed.
 * - `continue`     — run the handler as this principal.
 *
 * The expected principal is required for remotely invoked server functions
 * and for any non-GET call. A server function invoked during SSR (a loader on
 * the server, handler type `ssr`) has no page yet, so it is exempt.
 */

export const BOUNDARY_HEADER = 'x-modulus-auth-boundary'

export type BoundarySignal = 'renew' | 'changed'

export type BoundaryDecision<TSession> =
  | { action: 'continue'; session: TSession; principal: Principal }
  | { action: 'renew' }
  | { action: 'changed' }
  | { action: 'unauthorized' }

export const boundaryDecision = <TSession>(args: {
  state: SessionState<TSession>
  principalOf: (session: TSession) => Principal
  expected: Principal | null | undefined
  requiresExpected: boolean
}): BoundaryDecision<TSession> => {
  const { state } = args
  if (state.status === 'renewable') return { action: 'renew' }
  if (state.status !== 'valid') return { action: 'unauthorized' }

  const principal = args.principalOf(state.session)
  if (args.requiresExpected && !samePrincipal(principal, args.expected)) {
    return { action: 'changed' }
  }
  return { action: 'continue', session: state.session, principal }
}

/** The response thrown for a non-continue decision. */
export const boundaryResponse = (action: 'renew' | 'changed' | 'unauthorized'): Response => {
  if (action === 'unauthorized') return new Response('Unauthorized', { status: 401 })
  return new Response(action === 'renew' ? 'Session renewal required' : 'Session changed', {
    status: action === 'renew' ? 401 : 409,
    headers: { [BOUNDARY_HEADER]: action, 'Cache-Control': 'no-store' },
  })
}
