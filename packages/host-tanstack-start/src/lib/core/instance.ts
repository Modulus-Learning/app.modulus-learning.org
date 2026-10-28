import {
  AdminAuth,
  type AdminRequestContext,
  type AdminSession,
  AgentAuth,
  type AgentRequestContext,
  type CoreCommands,
  type CoreInstance,
  initCore,
  UserAuth,
  type UserRequestContext,
  type UserSession,
} from '@modulus-learning/core'
import { loadCoreConfigFromEnv, loadTokenVerifierConfigFromEnv } from '@modulus-learning/core/env'
import { canvasAdapter } from '@modulus-learning/core/lms/canvas'
import { initTokenVerifiers, type TokenVerifiers } from '@modulus-learning/core/tokens'
import type { Logger } from 'pino'

import { getServerConfig } from '@/config'

/**
 * Framework-neutral core wiring, shared by both hosts during the migration
 * (spec: Target Architecture → core wiring split). It owns the `initCore` and
 * token-verifier singletons and the pure request-context builders. Each host
 * adapter — `src/core-adapter.ts` (Next) and `src/lib/core/start-adapter.ts`
 * (Start) — supplies its own logger, session and request id.
 *
 * Only one host runs in a process, so the first caller's logger wins.
 */

// One core per process. TanStack Start can evaluate the server entry and the
// route handlers as separate module instances, so the singleton lives on
// `globalThis` rather than in module scope: the entry's boot-time
// initialisation and every later request share one instance, one connection
// pool, and one initialisation outcome.
const CORE = Symbol.for('modulus.coreInstance')
type CoreGlobal = { [CORE]?: Promise<CoreInstance> }

export const getCoreInstance = (logger: Logger): Promise<CoreInstance> => {
  const global = globalThis as CoreGlobal
  if (global[CORE] == null) {
    const { publicServerUrl } = getServerConfig()
    global[CORE] = initCore({
      pinoLogger: logger,
      config: loadCoreConfigFromEnv(process.env),
      // The installation's LMS. Canvas is the only adapter today; a host will
      // name its adapter in server configuration once it is a separate package.
      lms: canvasAdapter(),
      urlBuilder: {
        baseUrl: publicServerUrl,
        // The tool's launch endpoint, which is what an LTI resource link's
        // `target_link_uri` names: the end-point executed at the end of the
        // OIDC flow, reached by POST. It is deliberately not a page -- see
        // `LtiDeepLinkingService`, which uses this as the deep-link content
        // item's url.
        ltiLaunchUrl: `${publicServerUrl}/routes/lti/launch`,
        dashboardUrl: `${publicServerUrl}/dashboard`,
      },
    })
  }
  return global[CORE]
}

export const getCoreCommands = async (logger: Logger): Promise<CoreCommands> =>
  (await getCoreInstance(logger)).commands

let tokenVerifiersPromise: Promise<TokenVerifiers> | undefined

export const getCoreTokenVerifiers = (logger: Logger): Promise<TokenVerifiers> => {
  if (tokenVerifiersPromise == null) {
    tokenVerifiersPromise = initTokenVerifiers({
      pinoLogger: logger,
      config: loadTokenVerifierConfigFromEnv(process.env),
    })
  }
  return tokenVerifiersPromise
}

export const toUserRequestContext = (
  session: UserSession,
  requestId: string
): UserRequestContext => ({
  requestId,
  userAuth: new UserAuth(session.user.id, session.abilities),
})

export const toAdminRequestContext = (
  session: AdminSession,
  requestId: string
): AdminRequestContext => ({
  requestId,
  adminAuth: new AdminAuth(session.user.id, session.abilities),
})

/**
 * Build an agent context from an `Authorization` header value. Returns
 * undefined unless the header is exactly `Bearer <token>` and the token
 * verifies.
 */
export const toAgentRequestContext = async (
  authorization: string | null,
  requestId: string,
  verifiers: TokenVerifiers
): Promise<AgentRequestContext | undefined> => {
  if (authorization == null) {
    return undefined
  }

  const parts = authorization.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return undefined
  }

  const result = await verifiers.agent.verifyAccessToken(parts[1])
  if (result.status === 'valid') {
    const { activity_id, scope_id, user, renew_after } = result.payload
    return {
      requestId,
      agentAuth: new AgentAuth(user.id, activity_id, scope_id, renew_after),
    }
  }
}
