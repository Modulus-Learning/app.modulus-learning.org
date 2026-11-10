import { deleteCookie, getCookie, getRequestHeaders, setCookie } from '@tanstack/react-start/server'

/**
 * Server-side request helpers for the app's server modules: the current
 * request's cookies and headers, and `redirect` / `notFound` signals that the
 * server-function layer turns into outcomes (see `@/lib/server-action`).
 * Server-only: import it from `*.server.ts` modules and server handlers.
 */

type CookieOptions = {
  path?: string
  sameSite?: 'strict' | 'lax' | 'none'
  httpOnly?: boolean
  secure?: boolean
  expires?: number | Date
  maxAge?: number
}

type CookieInit = CookieOptions & { name: string; value: string }

const normalise = (options: CookieOptions = {}) => ({
  ...options,
  path: options.path ?? '/',
  expires: typeof options.expires === 'number' ? new Date(options.expires) : options.expires,
})

/** The current request's cookies, read and written through the response. */
export const cookies = async () => ({
  get: (name: string) => {
    const value = getCookie(name)
    return value == null ? undefined : { name, value }
  },
  has: (name: string) => getCookie(name) != null,
  set: (nameOrInit: string | CookieInit, value?: string, options?: CookieOptions) => {
    if (typeof nameOrInit === 'string') {
      setCookie(nameOrInit, value ?? '', normalise(options))
    } else {
      const { name, value: initValue, ...rest } = nameOrInit
      setCookie(name, initValue, normalise(rest))
    }
  },
  delete: (nameOrInit: string | { name: string; path?: string }) => {
    const name = typeof nameOrInit === 'string' ? nameOrInit : nameOrInit.name
    const path = typeof nameOrInit === 'string' ? '/' : (nameOrInit.path ?? '/')
    deleteCookie(name, { path })
  },
})

/** The current request's headers. */
export const headers = async () => new Headers(getRequestHeaders() as HeadersInit)

/** Thrown by `redirect()`; a server action returns it as a redirect outcome. */
export class ServerRedirect extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`)
  }
}

/** Thrown by `notFound()`. */
export class ServerNotFound extends Error {
  constructor() {
    super('not found')
  }
}

// Function declarations, not arrow consts: TypeScript narrows after a call
// to a `never`-returning function only when it is declared this way.

/** Ends a server action with a full-page navigation to `url`. */
export function redirect(url: string): never {
  throw new ServerRedirect(url)
}

export function notFound(): never {
  throw new ServerNotFound()
}
