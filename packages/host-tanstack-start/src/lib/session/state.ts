/**
 * Verification-only session classification (spec: Authentication And Sessions,
 * item 1). Pure, so both session domains and their tests share it.
 *
 * Nothing here rotates a credential. An expired access token with a refresh
 * cookie present is `renewable` — the explicit renewal server functions decide
 * whether the refresh token still holds. An access token that fails
 * verification for any other reason (bad signature, bad payload) is never
 * renewable: renewal must not paper over tampering.
 */
export type SessionState<TSession> =
  | { status: 'valid'; session: TSession; expiresAtMs: number }
  | { status: 'renewable' }
  | { status: 'anonymous' }

export interface VerificationResult<TSession> {
  status: string
  payload?: TSession
  expires_at_ms?: number
}

export const classifySession = <TSession>(
  verification: VerificationResult<TSession> | null,
  hasRefreshCookie: boolean
): SessionState<TSession> => {
  if (verification == null) {
    // No access cookie at all: the browser may still hold a refresh cookie.
    return hasRefreshCookie ? { status: 'renewable' } : { status: 'anonymous' }
  }
  if (
    verification.status === 'valid' &&
    verification.payload != null &&
    verification.expires_at_ms != null
  ) {
    return {
      status: 'valid',
      session: verification.payload,
      expiresAtMs: verification.expires_at_ms,
    }
  }
  if (verification.status === 'expired' && hasRefreshCookie) {
    return { status: 'renewable' }
  }
  return { status: 'anonymous' }
}
