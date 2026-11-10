import type { CookieWrite } from './cookies'
import type { Principal } from './principal'
import type { SessionState } from './state'

/**
 * Explicit session renewal (spec: Authentication And Sessions, item 2). Pure
 * decision logic shared by the learner and admin renewal server functions;
 * the server functions inject cookie access and the core refresh command.
 *
 * - A session that still verifies is left alone (`unchanged`), so a late or
 *   duplicate renewal never rotates twice.
 * - Only a `renewable` session (expired access, refresh cookie present) is
 *   refreshed; an access token that fails verification for any other reason is
 *   never papered over.
 * - A refused refresh is `terminal` (the user must sign in again); anything
 *   else that goes wrong is `transient` (worth a manual retry).
 * - Renewal writes cookies only on success. It never deletes them: a delayed
 *   failure must not erase cookies a concurrent sign-in has just installed.
 */

export type RenewalOutcome =
  | { status: 'unchanged' | 'renewed'; principal: Principal }
  | { status: 'terminal' | 'transient' }

type RefreshResult<TSession> =
  | { ok: true; data: { tokens: unknown; session: TSession } }
  | { ok: false; error: { code: string } }

export interface RenewalDeps<TSession> {
  state: SessionState<TSession>
  refreshToken: string | undefined
  principalOf: (session: TSession) => Principal
  refresh: (refreshToken: string) => Promise<RefreshResult<TSession>>
  cookieWrites: (tokens: unknown) => CookieWrite[]
  writeCookie: (write: CookieWrite) => void
}

/** Core's code for a refresh token that is invalid, or whose account is missing or disabled. */
const TERMINAL_CODES = new Set(['ERR_UNAUTHORIZED'])

export const renewSession = async <TSession>(
  deps: RenewalDeps<TSession>
): Promise<RenewalOutcome> => {
  const { state } = deps
  if (state.status === 'valid') {
    return { status: 'unchanged', principal: deps.principalOf(state.session) }
  }
  if (state.status !== 'renewable' || deps.refreshToken == null) {
    return { status: 'terminal' }
  }

  let result: RefreshResult<TSession>
  try {
    result = await deps.refresh(deps.refreshToken)
  } catch {
    return { status: 'transient' }
  }

  if (!result.ok) {
    return { status: TERMINAL_CODES.has(result.error.code) ? 'terminal' : 'transient' }
  }

  for (const write of deps.cookieWrites(result.data.tokens)) deps.writeCookie(write)
  return { status: 'renewed', principal: deps.principalOf(result.data.session) }
}
