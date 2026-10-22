import { createMiddleware, createServerFn } from '@tanstack/react-start'

import { getServerConfig } from '@/config'
import { toAdminRequestContext, toUserRequestContext } from '@/lib/core/instance'
import { currentRequestId } from '@/lib/request-scope'
import { requireSession, type Surface, surfaceGate } from '@/lib/server-fn-guards'
import { getAdminSessionState, getUserSessionState } from '@/lib/session/context'

/**
 * Server-function factories (spec: Data and mutations → surface-tagged
 * factories). Every server function in the app is built from one of these;
 * the convention test (`server-fn-convention.test.node.ts`) rejects a bare
 * `createServerFn` anywhere else.
 *
 * Server functions are invoked at opaque `/_serverFn/<id>` URLs, which the
 * server entry's path-based deployment-mode gate cannot classify, so the gate
 * travels with the function instead:
 *
 * | Factory             | Surface  | Session                       |
 * |---------------------|----------|-------------------------------|
 * | `frontendSurfaceFn` | frontend | none required                 |
 * | `adminSurfaceFn`    | admin    | none required                 |
 * | `appFn`             | frontend | valid user session required   |
 * | `adminFn`           | admin    | valid admin session required  |
 *
 * Sign-in, renewal and sign-out use the surface-only factories, so an expired
 * session can reach them. Task 7 adds the renewal boundary (and the expected-
 * principal check) to `appFn` and `adminFn` only.
 */

const surfaceMiddleware = (surface: Surface) =>
  createMiddleware({ type: 'function' }).server(({ next }) => {
    const refused = surfaceGate(getServerConfig().deployment.mode, surface)
    if (refused != null) throw refused
    return next()
  })

const frontendSurface = surfaceMiddleware('frontend')
const adminSurface = surfaceMiddleware('admin')

const userContextMiddleware = createMiddleware({ type: 'function' })
  .middleware([frontendSurface])
  .server(async ({ next }) => {
    const state = await getUserSessionState()
    const refused = requireSession(state)
    if (refused != null || state.status !== 'valid') throw refused
    return next({
      context: {
        core: toUserRequestContext(state.session, currentRequestId()),
        session: state.session,
      },
    })
  })

const adminContextMiddleware = createMiddleware({ type: 'function' })
  .middleware([adminSurface])
  .server(async ({ next }) => {
    const state = await getAdminSessionState()
    const refused = requireSession(state)
    if (refused != null || state.status !== 'valid') throw refused
    return next({
      context: {
        core: toAdminRequestContext(state.session, currentRequestId()),
        session: state.session,
      },
    })
  })

type ServerFnOptions = Parameters<typeof createServerFn>[0]

/** Frontend surface, no session required: public reads, learner sign-in/up, renewal, sign-out. */
export const frontendSurfaceFn = (options?: ServerFnOptions) =>
  createServerFn(options).middleware([frontendSurface])

/** Admin surface, no session required: admin sign-in, renewal and sign-out only. */
export const adminSurfaceFn = (options?: ServerFnOptions) =>
  createServerFn(options).middleware([adminSurface])

/** Frontend surface with a valid user session; `context.core` is the core user context. */
export const appFn = (options?: ServerFnOptions) =>
  createServerFn(options).middleware([userContextMiddleware])

/** Admin surface with a valid admin session; `context.core` is the core admin context. */
export const adminFn = (options?: ServerFnOptions) =>
  createServerFn(options).middleware([adminContextMiddleware])
