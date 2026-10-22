import { deleteCookie, getCookie, getRequestHeaders, setCookie } from '@tanstack/react-start/server'

/**
 * TanStack Start server-side stand-in for `next/headers` (`cookies()`,
 * `headers()`), used only while bridged Next server actions run on Start (see
 * `@/lib/action-bridge`). Covers exactly what those actions and the Next
 * session storage call. Removed in Task 18 with the bridge.
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

export const headers = async () => new Headers(getRequestHeaders() as HeadersInit)
