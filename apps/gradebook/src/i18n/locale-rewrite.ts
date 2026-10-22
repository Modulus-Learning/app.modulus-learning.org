import { i18nConfig, type Locale } from '@/i18n/i18n-config'

/**
 * Isomorphic locale URL rewrite pair, wired into `createRouter({ rewrite })`
 * (spec: Internationalisation; FORRU `locale-rewrite.ts`). Runs on the server
 * (incoming request parse) and the client (navigation), so the matcher always
 * sees a locale-prefixed path while the address bar stays clean for `en`.
 *
 * Two invariants, pinned by `locale-rewrite.test.ts`:
 *
 *  1. `input` prepends the default locale ONLY to localizable paths. The
 *     non-localized segments below and static files pass through untouched.
 *  2. `output` strips only a leading DEFAULT-locale segment. Every other
 *     locale prefix is preserved verbatim.
 *
 * Negotiation (cookie / Accept-Language → redirect) is not here: rewrites run
 * before route middleware and cannot read cookies on the client. It lives in
 * the server entry (`server-locale-redirect.ts`), on the un-rewritten request.
 */

/**
 * Top-level segments outside the localized tree:
 *   - `lti`, `agent`  → chromeless pages, served in English
 *   - `routes`        → server-route handlers (and the LTI register page)
 *   - `auth`          → the learner renewal bootstrap
 *   - `_serverFn`, `_build` → TanStack Start server functions and assets
 *   - `assets`, `fonts`, `modules` → static files and the analytics proxy
 *
 * `admin` is deliberately absent: the admin tree is localized (`/es/admin/…`).
 */
export const NON_LOCALIZED_SEGMENTS: ReadonlySet<string> = new Set([
  'lti',
  'agent',
  'routes',
  'auth',
  '_serverFn',
  '_build',
  'assets',
  'fonts',
  'modules',
])

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

/** A static file: the LAST segment carries an extension. */
const looksLikeAsset = (pathname: string) =>
  pathname.slice(pathname.lastIndexOf('/') + 1).includes('.')

/** True when the path belongs to the localized tree. Bare `/` is the localized home. */
export function isLocalizablePath(pathname: string): boolean {
  const first = pathname.split('/')[1] ?? ''
  if (first === '') return true
  if (NON_LOCALIZED_SEGMENTS.has(first)) return false
  if (looksLikeAsset(pathname)) return false
  return true
}

/** Inbound: the matcher must always see a locale segment on a localizable path. */
export function localeInputRewrite(url: URL): URL {
  const first = url.pathname.split('/')[1] ?? ''
  if (isLocale(first)) return url
  if (!isLocalizablePath(url.pathname)) return url
  url.pathname =
    url.pathname === '/'
      ? `/${i18nConfig.defaultLocale}`
      : `/${i18nConfig.defaultLocale}${url.pathname}`
  return url
}

/** Outbound: clean URLs for the default locale only. */
export function localeOutputRewrite(url: URL): URL {
  const first = url.pathname.split('/')[1] ?? ''
  if (first === i18nConfig.defaultLocale) {
    const rest = url.pathname.slice(`/${i18nConfig.defaultLocale}`.length)
    url.pathname = rest === '' ? '/' : rest
  }
  return url
}
