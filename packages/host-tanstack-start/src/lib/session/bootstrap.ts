import { safeCallbackPath } from '@/lib/safe-redirect'
import type { SessionDomain } from './principal'
import type { RenewalOutcome } from './renewal'

/**
 * Navigation-time recovery (spec: Authentication And Sessions, item 5). A
 * server render cannot renew — the coordination queue lives in the browser —
 * so it redirects to a chromeless bootstrap page that renews and returns.
 *
 * The `_renewed=1` marker on the return URL bounds this to one bootstrap per
 * navigation: a server render that finds the session still expired AND sees
 * the marker sends the user to sign-in instead of back to the bootstrap. The
 * marker lives in the URL so the guard holds without any storage.
 */

export const RENEWED_MARKER = '_renewed'

const BOOTSTRAP_PATH: Record<SessionDomain, string> = {
  user: '/auth/renew',
  admin: '/admin/renew',
}

const SIGN_IN_PATH: Record<SessionDomain, string> = {
  user: '/sign-in',
  admin: '/admin/sign-in',
}

const DEFAULT_RETURN: Record<SessionDomain, string> = {
  user: '/dashboard',
  admin: '/admin',
}

const stripMarker = (path: string): string => {
  const url = new URL(path, 'http://internal')
  url.searchParams.delete(RENEWED_MARKER)
  return `${url.pathname}${url.search}${url.hash}`
}

const withMarker = (path: string): string => {
  const url = new URL(path, 'http://internal')
  url.searchParams.set(RENEWED_MARKER, '1')
  return `${url.pathname}${url.search}${url.hash}`
}

const signInHref = (domain: SessionDomain, returnTo: string) =>
  `${SIGN_IN_PATH[domain]}?callbackUrl=${encodeURIComponent(stripMarker(returnTo))}`

/**
 * Where a server render with an expired-but-renewable session should send the
 * browser: the bootstrap, unless this navigation already came back from it.
 */
export const ssrRecoveryHref = (domain: SessionDomain, requestedPath: string): string => {
  const returnTo = safeCallbackPath(requestedPath, DEFAULT_RETURN[domain])
  if (new URL(returnTo, 'http://internal').searchParams.has(RENEWED_MARKER)) {
    return signInHref(domain, returnTo)
  }
  return `${BOOTSTRAP_PATH[domain]}?return=${encodeURIComponent(returnTo)}`
}

export type BootstrapStep =
  | { kind: 'navigate'; href: string }
  | { kind: 'session-unavailable' }
  | { kind: 'retry' }

/** What the bootstrap page does with a renewal outcome. */
export const bootstrapStep = (args: {
  domain: SessionDomain
  outcome: RenewalOutcome
  returnParam: string | null
  framed: boolean
}): BootstrapStep => {
  const returnTo = safeCallbackPath(args.returnParam, DEFAULT_RETURN[args.domain])
  switch (args.outcome.status) {
    case 'renewed':
    case 'unchanged':
      return { kind: 'navigate', href: withMarker(stripMarker(returnTo)) }
    case 'terminal':
      // LTI-provisioned learners have no password, so sign-in inside the
      // Canvas frame is a dead end: show the relaunch message instead.
      return args.framed && args.domain === 'user'
        ? { kind: 'session-unavailable' }
        : { kind: 'navigate', href: signInHref(args.domain, returnTo) }
    case 'transient':
      return { kind: 'retry' }
  }
}
