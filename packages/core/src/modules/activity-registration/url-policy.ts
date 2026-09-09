/**
 * The activity URL admission syntax and the candidate-to-rule match, as pure
 * functions over strings and `URL`.
 *
 * This module is deliberately dependency-free — no `@/lib/*`, no `BaseService`,
 * no logger, no request context — so the whole matching contract can be tested
 * exhaustively without a database, and so the OAuth authorization route can
 * call the syntactic half directly rather than growing a second definition of
 * it.
 *
 * It knows nothing about the rules stored in the database, the 255-character
 * bound on `activities.url`, or activity codes. Those belong to the policy
 * service, the registration service, and the per-code `url_prefix` check
 * respectively.
 */

/** The stored form of one rule: a normalized origin and a normalized subtree root. */
export type NormalizedBaseUrl = { origin: string; path_prefix: string }

/**
 * Hosts allowed to be reached over plain HTTP, for local development.
 *
 * `[::1]` is deliberately absent. The gradebook's form validator
 * (`apps/gradebook/src/modules/app/activities/@types/validate-urls.ts`) accepts
 * only `localhost` and `127.0.0.1` over HTTP, so admitting IPv6 loopback here
 * would create a URL core accepts but the form rejects before core ever sees
 * it. This is a deliberate exclusion, not an oversight.
 */
const HTTP_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Parses a candidate activity URL under the admission syntax: an absolute URL,
 * carrying no username or password, over `https:` — or `http:` for exactly the
 * loopback hosts above. Returns `null` for anything else.
 *
 * The scheme check is the substantive filter here, not a formality:
 * `javascript:alert(1)` and `data:text/html,x` are both accepted by `new URL()`
 * and by Zod's `z.url()`, so a validator built on either alone admits them.
 * Rejecting userinfo removes the `https://trusted.example@evil.example/`
 * disguise, in which the apparent host is only a username.
 */
export const parseAdmissibleUrl = (value: string): URL | null => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  // A credentialed URL displays one host and resolves to another.
  if (url.username !== '' || url.password !== '') {
    return null
  }

  if (url.protocol === 'https:') {
    return url
  }

  if (url.protocol === 'http:' && HTTP_LOOPBACK_HOSTS.has(url.hostname)) {
    return url
  }

  return null
}

/**
 * The syntactic half of the matching contract, as a boolean. Consults no policy
 * and performs no I/O, so a caller that only needs to know whether a value is
 * safe to use as a redirect destination — the OAuth authorization route — can
 * ask without a database round trip.
 *
 * This is a syntactic check only. It says nothing about whether the URL is
 * allowed by the sitewide policy.
 */
export const isUsableRedirectUri = (value: string): boolean => parseAdmissibleUrl(value) !== null

/**
 * Collapses a path to its stored form: always leading `/`, never a trailing
 * one, so `/course/calculus` and `/course/calculus/` are the same subtree root
 * and a stored trailing slash cannot change a match.
 */
const normalizePathPrefix = (pathname: string): string => {
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
  const trimmed = withLeadingSlash.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Normalizes an administrator's base-URL input to the stored pair.
 *
 * `URL.origin` drops a default port and lowercases the host, and query and
 * fragment are discarded, so `https://example.edu`, `https://example.edu/` and
 * `https://example.edu:443/?x=1` all produce the same pair. That collapsing is
 * exactly why creating a rule has to handle a collision with an existing one
 * rather than assume distinct input means a distinct rule.
 */
export const normalizeRuleBaseUrl = (
  value: string
): { ok: true; rule: NormalizedBaseUrl } | { ok: false; reason: 'malformed_url' } => {
  const url = parseAdmissibleUrl(value)
  if (url === null) {
    return { ok: false, reason: 'malformed_url' }
  }

  return {
    ok: true,
    rule: { origin: url.origin, path_prefix: normalizePathPrefix(url.pathname) },
  }
}

/** The human-readable base URL derived from a stored pair, for API and UI responses. */
export const toBaseUrl = (rule: NormalizedBaseUrl): string => {
  const path_prefix = normalizePathPrefix(rule.path_prefix)
  return path_prefix === '/' ? rule.origin : `${rule.origin}${path_prefix}`
}

/**
 * Pure candidate-to-rule match. Both sides are already parsed and normalized.
 *
 * This is the one place the deceptive-prefix defence lives, and it turns on two
 * comparisons being the right shape:
 *
 *   - the origin must be **equal**, never a `startsWith` — which would let
 *     `https://trusted.example` admit `https://trusted.example.evil/`; and
 *   - the path must either equal the rule path or continue at a segment
 *     boundary, never a bare `pathname.startsWith(path_prefix)` — which would
 *     let `/course/calculus` admit the unrelated `/course/calculus-2`.
 *
 * Query and fragment are not consulted, and `URL` has already resolved dot
 * segments, so `/course/calculus/../calculus-2` is compared as
 * `/course/calculus-2`.
 */
export const matchesRule = (candidate: URL, rule: NormalizedBaseUrl): boolean => {
  // Scheme and host are both case-insensitive, and a port is numeric, so
  // lowercasing the stored side loses nothing and keeps the comparison exact
  // even for a rule that was not written by `normalizeRuleBaseUrl`.
  if (candidate.origin !== rule.origin.toLowerCase()) {
    return false
  }

  const path_prefix = normalizePathPrefix(rule.path_prefix)
  if (path_prefix === '/') {
    return true
  }

  // Path comparison stays case-sensitive: unlike a host, a path is.
  return candidate.pathname === path_prefix || candidate.pathname.startsWith(`${path_prefix}/`)
}
