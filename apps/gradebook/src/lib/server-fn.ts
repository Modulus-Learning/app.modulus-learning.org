import { createMiddleware } from '@tanstack/react-start'

import type {
  AdminRequestContext,
  AdminSession,
  UserRequestContext,
  UserSession,
} from '@modulus-learning/core'

import { renewInBrowser } from '@/lib/session/browser-renewal'
import { expectedPrincipal, flagSessionChanged } from '@/lib/session/coordination'
import { isReusableBody, sendWithRenewal } from '@/lib/session/replay'
import type { Surface } from '@/lib/server-fn-guards'
import type { Principal, SessionDomain } from '@/lib/session/principal'

/**
 * Server-function gate middleware (spec: Data and mutations → surface-tagged
 * server functions). Every server function in the app is a literal
 * `createServerFn(...)` whose FIRST middleware is one of the four below; the
 * convention test (`server-fn-convention.test.node.ts`) enforces that.
 *
 * (Why middleware rather than wrapper factories: Start's compiler only
 * recognises a literal `createServerFn(...).handler(...)` call when it swaps
 * the handler for a client RPC stub. Behind a wrapper function the handler —
 * and every server import it makes — stays in the client bundle.)
 *
 * Server functions are invoked at opaque `/_serverFn/<id>` URLs, which the
 * server entry's path-based deployment-mode gate cannot classify, so the gate
 * travels with the function instead:
 *
 * | Middleware                  | Surface  | Session                      | Renewal boundary |
 * |-----------------------------|----------|------------------------------|------------------|
 * | `frontendSurfaceMiddleware` | frontend | none required                | no               |
 * | `adminSurfaceMiddleware`    | admin    | none required                | no               |
 * | `appSessionMiddleware`      | frontend | valid user session required  | yes              |
 * | `adminSessionMiddleware`    | admin    | valid admin session required | yes              |
 *
 * Sign-in, renewal and sign-out use the surface-only middleware, so an expired
 * session can reach them and renewal can never recurse into the boundary.
 *
 * Server halves live in `./server-fn.server` and are loaded with a dynamic
 * `import()`, so core and the session readers never enter the client bundle.
 */

const serverHalf = () => import('./server-fn.server')

const surfaceMiddleware = (surface: Surface) =>
  createMiddleware({ type: 'function' }).server(async ({ next }) => {
    ;(await serverHalf()).enforceSurface(surface)
    return next()
  })

const frontendSurface = surfaceMiddleware('frontend')
const adminSurface = surfaceMiddleware('admin')

/**
 * The renewal boundary (spec: Authentication And Sessions, items 4 and 7).
 *
 * Client half: sends the page's expected principal and, only on a `renew`
 * signal, renews once (single-flight, queued) and replays a re-sendable body.
 * Server half: verifies before the handler and answers `renew`, `changed` or
 * 401 without running it; on every other outcome strips the reserved header so
 * a handler cannot forge a signal.
 */
const sessionBoundary = <TSession>(
  domain: SessionDomain,
  surface: ReturnType<typeof surfaceMiddleware>
) =>
  createMiddleware({ type: 'function' })
    .middleware([surface])
    .client(({ next }) => {
      if (typeof window === 'undefined') {
        return next({ sendContext: { expectedPrincipal: null as Principal | null } })
      }
      const expected = expectedPrincipal(domain)
      return next({
        sendContext: { expectedPrincipal: expected },
        fetch: (input, init) =>
          sendWithRenewal({
            send: () => fetch(input, init),
            reusable: isReusableBody(input, init),
            expected,
            renew: () => renewInBrowser(domain),
            flagChanged: () => flagSessionChanged(domain),
          }),
      })
    })
    .server(async ({ next, context, method }) => {
      const server = await serverHalf()
      const { session, principal } = await server.enforceSession(
        domain,
        context.expectedPrincipal,
        method
      )
      try {
        const result = await next({
          context: { session: session as TSession, principal },
        })
        server.stripBoundarySignal()
        return result
      } catch (error) {
        server.stripBoundarySignal(error)
        throw error
      }
    })

const userBoundary = sessionBoundary<UserSession>('user', frontendSurface)
const adminBoundary = sessionBoundary<AdminSession>('admin', adminSurface)

const userContext = createMiddleware({ type: 'function' })
  .middleware([userBoundary])
  .server(async ({ next, context }) => {
    const core: UserRequestContext = (await serverHalf()).userCoreContext(context.session)
    return next({ context: { core } })
  })

const adminContext = createMiddleware({ type: 'function' })
  .middleware([adminBoundary])
  .server(async ({ next, context }) => {
    const core: AdminRequestContext = (await serverHalf()).adminCoreContext(context.session)
    return next({ context: { core } })
  })

/** Frontend surface, no session required: public reads, learner sign-in/up, renewal, sign-out. */
export const frontendSurfaceMiddleware = frontendSurface

/** Admin surface, no session required: admin sign-in, renewal and sign-out only. */
export const adminSurfaceMiddleware = adminSurface

/** Frontend surface, valid user session, renewal boundary; `context.core` is the core user context. */
export const appSessionMiddleware = userContext

/** Admin surface, valid admin session, renewal boundary; `context.core` is the core admin context. */
export const adminSessionMiddleware = adminContext
