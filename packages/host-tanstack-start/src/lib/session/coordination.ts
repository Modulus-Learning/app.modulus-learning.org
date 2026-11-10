import type { Principal, SessionDomain } from './principal'
import type { RenewalOutcome } from './renewal'

/**
 * Browser-side session coordination, ported from Byline's
 * `session-coordination.ts` (spec: Authentication And Sessions, item 3).
 * No credential ever reaches JavaScript; this holds only the page's expected
 * principal and coordination state.
 *
 * Each session domain (`user`, `admin`) is coordinated independently, because
 * a browser may hold both at once.
 *
 * Every browser API is feature-detected and wrapped (spec: Canvas iframe
 * constraint): inside a partitioned or storage-restricted frame,
 * - Web Locks missing or throwing → the in-tab queue alone;
 * - BroadcastChannel missing or throwing → no cross-tab notice;
 * The expected principal lives in memory, taken from the page's own data, so
 * losing storage never weakens the replay guard.
 */

interface DomainState {
  expected: Principal | null
  changed: boolean
  renewal: Promise<RenewalOutcome> | undefined
  queue: Promise<unknown>
  channel: BroadcastChannel | null | undefined
  listeners: Set<() => void>
}

const domains = new Map<SessionDomain, DomainState>()

const stateOf = (domain: SessionDomain): DomainState => {
  let state = domains.get(domain)
  if (state == null) {
    state = {
      expected: null,
      changed: false,
      renewal: undefined,
      queue: Promise.resolve(),
      channel: undefined,
      listeners: new Set(),
    }
    domains.set(domain, state)
  }
  return state
}

const notify = (state: DomainState) => {
  for (const listener of state.listeners) listener()
}

/** Record the principal the page was rendered for. Called from page data. */
export const setExpectedPrincipal = (domain: SessionDomain, principal: Principal | null) => {
  const state = stateOf(domain)
  state.expected = principal
  state.changed = false
  notify(state)
}

export const expectedPrincipal = (domain: SessionDomain): Principal | null =>
  stateOf(domain).expected

export const flagSessionChanged = (domain: SessionDomain) => {
  const state = stateOf(domain)
  state.changed = true
  notify(state)
}

export const sessionIsChanged = (domain: SessionDomain) => stateOf(domain).changed

export const subscribeSessionChange = (domain: SessionDomain, listener: () => void) => {
  const state = stateOf(domain)
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}

/** Run `work` once at a time per domain; concurrent callers share the result. */
export const renewSingleFlight = (
  domain: SessionDomain,
  work: () => Promise<RenewalOutcome>
): Promise<RenewalOutcome> => {
  const state = stateOf(domain)
  if (state.renewal == null) {
    state.renewal = work().finally(() => {
      state.renewal = undefined
    })
  }
  return state.renewal
}

const webLocks = (): LockManager | undefined => {
  try {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : undefined
  } catch {
    return undefined
  }
}

/**
 * Serialise cookie-mutating auth actions (renewal, sign-in, sign-out): an
 * in-tab queue always, extended across tabs with Web Locks when available.
 */
export const coordinateAuthAction = <T>(
  domain: SessionDomain,
  work: () => Promise<T>
): Promise<T> => {
  const state = stateOf(domain)
  const run = state.queue
    .catch(() => {})
    .then(async () => {
      const locks = webLocks()
      if (locks == null) return work()
      let started = false
      try {
        return (await locks.request(`modulus.auth.${domain}`, () => {
          started = true
          return work()
        })) as T
      } catch (error) {
        // A lock manager that refuses before granting the lock (e.g. denied
        // storage) must not block the action; the in-tab queue still
        // serialises this tab. Once `work` has started, its outcome is final:
        // a failed sign-in or renewal has an unknown server-side effect and is
        // never run a second time.
        if (!started && error instanceof DOMException && error.name !== 'AbortError') {
          return work()
        }
        throw error
      }
    })
  state.queue = run
  return run
}

const channelFor = (domain: SessionDomain): BroadcastChannel | null => {
  const state = stateOf(domain)
  if (state.channel !== undefined) return state.channel
  try {
    if (typeof BroadcastChannel === 'undefined') {
      state.channel = null
    } else {
      const channel = new BroadcastChannel(`modulus.session.${domain}`)
      channel.onmessage = () => flagSessionChanged(domain)
      state.channel = channel
    }
  } catch {
    state.channel = null
  }
  return state.channel
}

/** Start listening for sign-in/sign-out notices from other tabs. */
export const startSessionNotifications = (domain: SessionDomain) => {
  channelFor(domain)
}

/** Tell other tabs a sign-in or sign-out happened. Carries no credential. */
export const notifySessionAction = (domain: SessionDomain) => {
  try {
    channelFor(domain)?.postMessage({ type: 'session-changed' })
  } catch {
    // No cross-tab notice available; other tabs find out on their next call.
  }
}

/** Test-only: forget all coordination state. */
export const resetCoordinationForTests = () => {
  for (const state of domains.values()) state.channel?.close()
  domains.clear()
}
