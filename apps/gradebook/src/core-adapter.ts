import type { NextRequest } from 'next/server'

import {
  AdminAuth,
  type AdminRequestContext,
  AgentAuth,
  type AgentRequestContext,
  type CoreCommands,
  type CoreInstance,
  initCore,
  type RequestContext,
  UserAuth,
  type UserRequestContext,
} from '@modulus-learning/core'
import { initTokenVerifiers, type TokenVerifiers } from '@modulus-learning/core/tokens'

import { getServerConfig } from './config'
import { getLogger } from './lib/logger'
import { getRequestId } from './lib/request-id'
import { getAdminSession } from './modules/admin/session/storage'
import { getUserSession } from './modules/app/session/storage'

// Singleton instance of the full core instance (commands + background jobs)
let coreInstancePromise: Promise<CoreInstance>

export const getCoreInstance = (): Promise<CoreInstance> => {
  if (coreInstancePromise == null) {
    const { publicServerUrl } = getServerConfig()
    coreInstancePromise = initCore({
      pinoLogger: getLogger(),
      urlBuilder: {
        baseUrl: publicServerUrl,
        startActivityUrl: (activityCode: string, activityUrl: string) =>
          `${publicServerUrl}/lti/launch/${activityCode}/${activityUrl}`,
        ltiLaunchUrl: `${publicServerUrl}/lti/launch`,
        dashboardUrl: `${publicServerUrl}/dashboard`,
      },
    })
  }

  return coreInstancePromise
}

// Convenience accessor for the commands facade
export const getCoreCommands = async (): Promise<CoreCommands> => (await getCoreInstance()).commands

// Singleton instance of modulus core token verifiers
let tokenVerifiersPromise: Promise<TokenVerifiers>

export const getCoreTokenVerifiers = (): Promise<TokenVerifiers> => {
  if (tokenVerifiersPromise == null) {
    tokenVerifiersPromise = initTokenVerifiers({ pinoLogger: getLogger() })
  }
  return tokenVerifiersPromise
}

export const getCoreRequestContext = async (): Promise<RequestContext> => {
  return {
    requestId: await getRequestId(),
  }
}

// Utility to construct a UserAuth instance for the current request
export const getCoreUserRequestContext = async (): Promise<UserRequestContext | undefined> => {
  const session = await getUserSession()
  if (session != null) {
    return {
      requestId: await getRequestId(),
      userAuth: new UserAuth(session.user.id, session.abilities),
    }
  }
}

export const getCoreAdminRequestContext = async (): Promise<AdminRequestContext | undefined> => {
  const session = await getAdminSession()
  if (session != null) {
    return {
      requestId: await getRequestId(),
      adminAuth: new AdminAuth(session.user.id, session.abilities),
    }
  }
}

export const getCoreAgentRequestContext = async (
  request: NextRequest
): Promise<AgentRequestContext | undefined> => {
  const header = request.headers.get('Authorization')
  if (header == null) {
    return undefined
  }

  const headerParts = header.split(' ')
  if (headerParts.length !== 2 || headerParts[0] !== 'Bearer') {
    return undefined
  }

  const tokenVerifiers = await getCoreTokenVerifiers()
  const result = await tokenVerifiers.agent.verifyAccessToken(headerParts[1])

  if (result.status === 'valid') {
    const { activity_id, user, renew_after } = result.payload
    return {
      requestId: await getRequestId(request),
      agentAuth: new AgentAuth(user.id, activity_id, renew_after),
    }
  }
}
