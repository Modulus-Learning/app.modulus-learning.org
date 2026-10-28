import type {
  AdminRequestContext,
  AgentRequestContext,
  CoreCommands,
  CoreInstance,
  RequestContext,
  UserRequestContext,
} from '@modulus-learning/core'
import type { TokenVerifiers } from '@modulus-learning/core/tokens'

import * as shared from '@/lib/core/instance'
import * as start from '@/lib/core/start-adapter'
import { getServerLogger } from '@/lib/server-logger'

/**
 * The core adapter for the app's server modules (`*.server.ts`): the core
 * singleton, commands and request contexts, resolved from the current request
 * (see `@/lib/core/start-adapter`). Server-only.
 */

export const getCoreInstance = (): Promise<CoreInstance> =>
  shared.getCoreInstance(getServerLogger())

export const getCoreCommands = (): Promise<CoreCommands> => start.getCoreCommands()

export const getCoreTokenVerifiers = (): Promise<TokenVerifiers> =>
  shared.getCoreTokenVerifiers(getServerLogger())

export const getCoreRequestContext = async (): Promise<RequestContext> =>
  start.getCoreRequestContext()

export const getCoreUserRequestContext = (): Promise<UserRequestContext | undefined> =>
  start.getCoreUserRequestContext()

export const getCoreAdminRequestContext = (): Promise<AdminRequestContext | undefined> =>
  start.getCoreAdminRequestContext()

export const getCoreAgentRequestContext = (
  request: Request
): Promise<AgentRequestContext | undefined> => start.getCoreAgentRequestContext(request)
