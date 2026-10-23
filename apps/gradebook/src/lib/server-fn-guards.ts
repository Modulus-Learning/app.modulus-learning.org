import type { DeploymentMode } from '@/lib/deployment-mode'
import type { SessionState } from '@/lib/session/state'

/**
 * Pure decisions behind the server-function factories (`@/lib/server-fn`),
 * kept separate so they can be tested without the Start runtime.
 *
 * Both return a `Response` to throw, or null to continue. Start returns a
 * thrown `Response` from a server function to the client as-is.
 */

export type Surface = 'frontend' | 'admin'

/** 404 unless this deployment mode serves the surface — as if the function did not exist. */
export const surfaceGate = (mode: DeploymentMode, surface: Surface): Response | null =>
  mode === 'all-in-one' || mode === surface ? null : new Response('Not Found', { status: 404 })

/**
 * 401 unless the session verifies now. A renewable session is still refused
 * here; Task 7's renewal boundary turns that refusal into a signalled renewal.
 */
export const requireSession = <TSession>(state: SessionState<TSession>): Response | null =>
  state.status === 'valid' ? null : new Response('Unauthorized', { status: 401 })

/**
 * Validator for a server function that carries a positional argument list
 * (the native read functions keep their modules' original signatures). Anything
 * but an array of at most `max` items is refused with a 400 before the handler.
 */
export const argumentList =
  <TArgs extends unknown[]>(max: number) =>
  (data: unknown): TArgs => {
    if (!Array.isArray(data) || data.length > max) {
      throw new Response('Bad Request', { status: 400 })
    }
    return data as TArgs
  }
