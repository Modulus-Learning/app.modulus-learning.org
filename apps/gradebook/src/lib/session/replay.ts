import { BOUNDARY_HEADER } from './boundary'
import { type Principal, samePrincipal } from './principal'
import type { RenewalOutcome } from './renewal'

/**
 * The client half of the renewal boundary (spec: Authentication And Sessions,
 * item 4): send one server-function request and, only when the server proves
 * the handler did not run, renew and replay it once.
 *
 * Replays only when ALL hold:
 *  - the response carries `renew` (set by the boundary before the handler);
 *  - one coordinated renewal succeeded;
 *  - the renewed principal equals the call's expected principal;
 *  - the body can be sent again;
 *  - no replay has happened yet for this call.
 *
 * Every other outcome is returned or thrown untouched — a handler error, a
 * 4xx/5xx without the signal, a network error, timeout or abort. In those the
 * handler may have run, so a retry could submit twice.
 */

export class SessionChangedError extends Error {
  readonly code = 'ERR_SESSION_CHANGED'
  constructor() {
    super('You are now signed in as a different account. Reload the page before continuing.')
  }
}

export class SessionRenewedRetryError extends Error {
  readonly code = 'ERR_SESSION_RENEWED_RETRY'
  constructor() {
    super('Your session was renewed. Please submit again.')
  }
}

export class SessionEndedError extends Error {
  readonly code = 'ERR_SESSION_ENDED'
  constructor(readonly outcome: 'terminal' | 'transient') {
    super(
      outcome === 'terminal'
        ? 'Your session has ended. Please sign in again.'
        : 'Your session could not be renewed. Please try again.'
    )
  }
}

export interface ReplayDeps {
  /** Sends the request; called at most twice. */
  send: () => Promise<Response>
  /** Whether `send` can be called again with the same body. */
  reusable: boolean
  expected: Principal | null
  /** One coordinated renewal (single-flight, queued). */
  renew: () => Promise<RenewalOutcome>
  /** Records a session change so the page can show its interstitial. */
  flagChanged: () => void
}

export const sendWithRenewal = async (deps: ReplayDeps): Promise<Response> => {
  const response = await deps.send()
  const signal = response.headers.get(BOUNDARY_HEADER)

  if (signal === 'changed') {
    deps.flagChanged()
    throw new SessionChangedError()
  }
  if (signal !== 'renew') return response

  const outcome = await deps.renew()
  if (!('principal' in outcome)) {
    throw new SessionEndedError(outcome.status)
  }
  if (!samePrincipal(outcome.principal, deps.expected)) {
    deps.flagChanged()
    throw new SessionChangedError()
  }
  if (!deps.reusable) throw new SessionRenewedRetryError()

  const replayed = await deps.send()
  if (replayed.headers.get(BOUNDARY_HEADER) === 'changed') {
    deps.flagChanged()
    throw new SessionChangedError()
  }
  // A second `renew` signal is not chased: at most one replay per call.
  return replayed
}

/** Whether a fetch body can be re-sent. A stream (or a cloned Request) cannot. */
export const isReusableBody = (input: RequestInfo | URL, init?: RequestInit): boolean =>
  !(input instanceof Request) && !(init?.body instanceof ReadableStream)
