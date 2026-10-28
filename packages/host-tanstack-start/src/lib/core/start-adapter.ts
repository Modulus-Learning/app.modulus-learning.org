import { getRequestHeader } from '@tanstack/react-start/server'

import type {
  AdminRequestContext,
  AgentRequestContext,
  CoreCommands,
  RequestContext,
  UserRequestContext,
} from '@modulus-learning/core'

import { currentRequestId } from '@/lib/request-scope'
import { getServerLogger } from '@/lib/server-logger'
import { getAdminSessionState, getUserSessionState } from '@/lib/session/context'
import * as shared from './instance'

/**
 * The TanStack Start host's core adapter: the same accessors as the Next
 * `src/core-adapter.ts`, built on the verification-only session context and
 * the request-scope id. Server-only.
 */

export const getCoreCommands = (): Promise<CoreCommands> =>
  shared.getCoreCommands(getServerLogger())

export const getCoreRequestContext = (): RequestContext => ({ requestId: currentRequestId() })

/** The user context, or undefined unless the access cookie verifies now. */
export const getCoreUserRequestContext = async (): Promise<UserRequestContext | undefined> => {
  const state = await getUserSessionState()
  if (state.status === 'valid') {
    return shared.toUserRequestContext(state.session, currentRequestId())
  }
}

/** The admin context, or undefined unless the access cookie verifies now. */
export const getCoreAdminRequestContext = async (): Promise<AdminRequestContext | undefined> => {
  const state = await getAdminSessionState()
  if (state.status === 'valid') {
    return shared.toAdminRequestContext(state.session, currentRequestId())
  }
}

/** The agent context from the current request's `Authorization` header. */
export const getCoreAgentRequestContext = async (
  request?: Request
): Promise<AgentRequestContext | undefined> =>
  shared.toAgentRequestContext(
    request != null
      ? request.headers.get('Authorization')
      : (getRequestHeader('Authorization') ?? null),
    currentRequestId(),
    await shared.getCoreTokenVerifiers(getServerLogger())
  )
