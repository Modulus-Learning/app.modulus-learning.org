/**
 * Shared helpers for the route-contract suite. See `vitest.contract.config.ts`.
 *
 * The suite pins the externally visible behaviour of the gradebook: status
 * codes, `Location`, `Set-Cookie` attributes, CORS headers and JSON shapes, per
 * deployment mode. It was written against the Next app and run against both
 * hosts during the migration; Next has since been removed. The `next`
 * expectations in `byTarget` and `TARGET === 'start'` guards remain as the
 * record of each deliberate change (spec: Legacy Session Endpoints;
 * Internationalisation). The default target is `start`.
 */

export type Target = 'next' | 'start'
export type Mode = 'all-in-one' | 'frontend' | 'admin'

export const BASE_URL = (process.env.CONTRACT_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
)
export const TARGET = (process.env.CONTRACT_TARGET ?? 'start') as Target
export const MODE = (process.env.CONTRACT_MODE ?? 'all-in-one') as Mode

/** Whether the server under test serves a surface in the current mode. */
export const serves = (surface: 'frontend' | 'admin') => MODE === 'all-in-one' || MODE === surface

/**
 * A deliberate contract change between the Next app and the Start app. The
 * value for each target is the expectation; every use cites the spec section
 * that authorises the change.
 */
export const byTarget = <T>(expectations: Record<Target, T>): T => expectations[TARGET]

export const request = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE_URL}${path}`, { redirect: 'manual', ...init })

export const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  body: new URLSearchParams(fields),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
})

/** `Location` resolved against the base URL, as path + query when same-origin. */
export const location = (response: Response): string | null => {
  const value = response.headers.get('location')
  if (value == null) return null
  const url = new URL(value, BASE_URL)
  return url.origin === new URL(BASE_URL).origin ? `${url.pathname}${url.search}` : url.href
}

/** Parsed `Set-Cookie` headers, attribute names lower-cased. */
export const setCookies = (response: Response) =>
  response.headers.getSetCookie().map((header) => {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim())
    const eq = pair.indexOf('=')
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      attributes: Object.fromEntries(
        attributes.map((attribute) => {
          const [key, ...rest] = attribute.split('=')
          return [key.toLowerCase(), rest.length > 0 ? rest.join('=') : true]
        })
      ) as Record<string, string | true>,
    }
  })

export const AGENT_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
}

export const AGENT_TOKEN_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers': 'Content-Type',
}

export const headersOf = (response: Response, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, response.headers.get(name)]))
