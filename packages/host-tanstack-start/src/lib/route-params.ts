import type { Locale } from '@/i18n/i18n-config'

/**
 * Route params and context as packaged route factories see them. The host
 * supplies each factory's path, so TanStack cannot derive these types from a
 * route tree inside the package; the host's own route tree types its routes.
 */
export type RouteParams = { lng: Locale; [param: string]: string }
// biome-ignore lint/suspicious/noExplicitAny: context shape is set by the host's beforeLoad chain
export type RouteContext = Record<string, any>
