import type { NextRequest } from 'next/server'

import type {
  AdminRequestContext,
  AgentRequestContext,
  CoreCommands,
  CoreInstance,
  RequestContext,
  UserRequestContext,
} from '@modulus-learning/core'
import type { TokenVerifiers } from '@modulus-learning/core/tokens'

import * as shared from './lib/core/instance'
import { getLogger } from './lib/logger'
import { getRequestId } from './lib/request-id'
import { getAdminSession } from './modules/admin/session/storage'
import { getUserSession } from './modules/app/session/storage'

// The Next host's core adapter. Initialisation and context building live in
// the framework-neutral `@/lib/core/instance`, shared with the TanStack Start
// adapter (`@/lib/core/start-adapter`); this module supplies the Next pieces —
// `next/headers` sessions, the proxy-set request id and `NextRequest` — and
// keeps every existing `@/core-adapter` import working. Removed in Task 18.

export const getCoreInstance = (): Promise<CoreInstance> => shared.getCoreInstance(getLogger())

// Convenience accessor for the commands facade
export const getCoreCommands = (): Promise<CoreCommands> => shared.getCoreCommands(getLogger())

export const getCoreTokenVerifiers = (): Promise<TokenVerifiers> =>
  shared.getCoreTokenVerifiers(getLogger())

export const getCoreRequestContext = async (): Promise<RequestContext> => {
  return {
    requestId: await getRequestId(),
  }
}

// Utility to construct a UserAuth instance for the current request
export const getCoreUserRequestContext = async (): Promise<UserRequestContext | undefined> => {
  const session = await getUserSession()
  if (session != null) {
    return shared.toUserRequestContext(session, await getRequestId())
  }
}

export const getCoreAdminRequestContext = async (): Promise<AdminRequestContext | undefined> => {
  const session = await getAdminSession()
  if (session != null) {
    return shared.toAdminRequestContext(session, await getRequestId())
  }
}

export const getCoreAgentRequestContext = async (
  request: NextRequest
): Promise<AgentRequestContext | undefined> =>
  shared.toAgentRequestContext(
    request.headers.get('Authorization'),
    await getRequestId(request),
    await getCoreTokenVerifiers()
  )
