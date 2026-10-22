import { removeResponseHeader } from '@tanstack/react-start/server'

import { getServerConfig } from '@/config'
import { toAdminRequestContext, toUserRequestContext } from '@/lib/core/instance'
import { currentRequestId, getRequestScope } from '@/lib/request-scope'
import { type Surface, surfaceGate } from '@/lib/server-fn-guards'
import { BOUNDARY_HEADER, boundaryDecision, boundaryResponse } from '@/lib/session/boundary'
import { getAdminSessionState, getUserSessionState } from '@/lib/session/context'
import { type Principal, principalOf, type SessionDomain } from '@/lib/session/principal'

/**
 * Server halves of the server-function factory middleware (`@/lib/server-fn`).
 * Loaded with a dynamic `import()` from inside each `.server()` callback, so
 * none of this — core, config, session readers — enters the client bundle.
 */

/** Throws a 404 Response unless this deployment mode serves the surface. */
export const enforceSurface = (surface: Surface): void => {
  const refused = surfaceGate(getServerConfig().deployment.mode, surface)
  if (refused != null) throw refused
}

/**
 * Verifies the session before the handler. Throws `renew` / `changed` / 401
 * Responses without running it; otherwise returns the verified session.
 */
export const enforceSession = async (
  domain: SessionDomain,
  expected: Principal | null | undefined,
  method: string
) => {
  const state = domain === 'user' ? await getUserSessionState() : await getAdminSessionState()
  const decision = boundaryDecision({
    state: state as typeof state & { status: string },
    principalOf: (session: { user: { id: string } }) => principalOf(domain, session),
    expected,
    // Remote calls and non-GET calls must name their page's principal; a
    // server function run during SSR has no page yet.
    requiresExpected: getRequestScope()?.log.handlerType === 'serverFn' || method !== 'GET',
  })
  if (decision.action !== 'continue') throw boundaryResponse(decision.action)
  return { session: decision.session, principal: decision.principal }
}

/** Removes any boundary signal a handler tried to set (on the response or a thrown Response). */
export const stripBoundarySignal = (thrown?: unknown): void => {
  if (thrown instanceof Response) thrown.headers.delete(BOUNDARY_HEADER)
  removeResponseHeader(BOUNDARY_HEADER)
}

export const userCoreContext = (session: Parameters<typeof toUserRequestContext>[0]) =>
  toUserRequestContext(session, currentRequestId())

export const adminCoreContext = (session: Parameters<typeof toAdminRequestContext>[0]) =>
  toAdminRequestContext(session, currentRequestId())
