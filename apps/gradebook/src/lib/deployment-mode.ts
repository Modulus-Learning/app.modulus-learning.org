import { pathWithoutLocale } from '@/i18n/utils'

/**
 * Which surfaces of the application a given instance serves. Mirrors the
 * `deployment.mode` value in `@/config`.
 */
export const DEPLOYMENT_MODES = ['all-in-one', 'frontend', 'admin'] as const
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number]

/**
 * Read the deployment mode straight from the environment, defaulting to
 * 'all-in-one'. This is intentionally independent of the full server config
 * (`getServerConfig`) so it stays safe to call during static prerendering, where
 * the server secrets are absent and parsing the whole config would throw -- the
 * gate only needs this single flag. The full config still validates the value
 * strictly at runtime startup (see `@/config` + instrumentation).
 */
export const getDeploymentMode = (): DeploymentMode => {
  const raw = process.env.DEPLOYMENT_MODE
  return (DEPLOYMENT_MODES as readonly string[]).includes(raw ?? '')
    ? (raw as DeploymentMode)
    : 'all-in-one'
}

/**
 * The surface a request path belongs to:
 * - `admin`    — the administrative UI and its API routes.
 * - `frontend` — the public/learner + LTI UI and its API routes.
 * - `neutral`  — infra/health endpoints that must stay reachable in every mode.
 */
export type RouteClass = 'admin' | 'frontend' | 'neutral'

/**
 * Health / infrastructure endpoints (load-balancer probes, keep-alive) that
 * every deployment mode must keep serving regardless of which surface it hosts.
 */
const NEUTRAL_API_PREFIXES = ['/routes/keep-alive', '/routes/elb-status']

const hasPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

/**
 * Classify a request pathname into the surface it belongs to.
 *
 * The pathname may carry a leading locale segment (e.g. `/es/admin/...`) because
 * non-default locales are kept in the URL; we strip it before matching so that
 * `/admin` and `/es/admin` classify identically. This module is intentionally
 * pure (no Node/Next server APIs) so it can run in the edge proxy as well as in
 * server components and route handlers.
 */
export const classifyRoute = (rawPathname: string): RouteClass => {
  const pathname = pathWithoutLocale(rawPathname)

  if (NEUTRAL_API_PREFIXES.some((prefix) => hasPrefix(pathname, prefix))) {
    return 'neutral'
  }

  // Admin surface: the admin UI pages and the admin API routes.
  if (hasPrefix(pathname, '/admin') || hasPrefix(pathname, '/routes/admin')) {
    return 'admin'
  }

  // Everything else the app serves is the frontend surface: the public/learner
  // UI, the LTI launch/deep-link pages, and the lti/auth/oauth/agent API routes.
  return 'frontend'
}

/**
 * Whether a request to `pathname` is permitted under the given deployment mode.
 * `all-in-one` permits everything; the single-surface modes permit only their
 * own surface plus neutral infra endpoints.
 */
export const isRouteAllowed = (mode: DeploymentMode, pathname: string): boolean => {
  if (mode === 'all-in-one') {
    return true
  }

  const routeClass = classifyRoute(pathname)
  if (routeClass === 'neutral') {
    return true
  }

  return mode === routeClass
}
