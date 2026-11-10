/**
 * Session cookie attributes for the TanStack Start host. They must match the
 * Next host's `modules/{app,admin}/session/storage.ts` byte for byte (spec:
 * Non-Negotiable Contract 3): same path, `SameSite`, `HttpOnly`, `Secure`, and
 * an expiry 30 seconds past the token's to absorb clock skew. A refresh cookie
 * without "remember me" is a session cookie (no expiry).
 */

export interface CookieSettings {
  name: string
  sameSite: 'strict' | 'lax' | 'none'
  httpOnly: boolean
  secure: boolean
}

export interface TokenPair {
  access: { token: string; expiration_in_ms: number }
  refresh: { token: string; expiration_in_ms: number }
  remember_me: boolean
}

export interface CookieWrite {
  name: string
  value: string
  options: {
    path: '/'
    sameSite: CookieSettings['sameSite']
    httpOnly: boolean
    secure: boolean
    expires?: Date
  }
}

const CLOCK_SKEW_MS = 30 * 1000

const optionsFor = (settings: CookieSettings, expires: Date | undefined) => ({
  path: '/' as const,
  sameSite: settings.sameSite,
  httpOnly: settings.httpOnly,
  secure: settings.secure,
  ...(expires != null ? { expires } : {}),
})

/** The two cookie writes that install a token pair. */
export const sessionCookieWrites = (
  tokens: TokenPair,
  access: CookieSettings,
  refresh: CookieSettings
): [CookieWrite, CookieWrite] => [
  {
    name: access.name,
    value: tokens.access.token,
    options: optionsFor(access, new Date(tokens.access.expiration_in_ms + CLOCK_SKEW_MS)),
  },
  {
    name: refresh.name,
    value: tokens.refresh.token,
    options: optionsFor(
      refresh,
      tokens.remember_me ? new Date(tokens.refresh.expiration_in_ms + CLOCK_SKEW_MS) : undefined
    ),
  },
]
