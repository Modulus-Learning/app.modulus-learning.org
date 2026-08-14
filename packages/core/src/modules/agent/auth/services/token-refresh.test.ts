import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { AgentAuth } from '@/lib/auth.js'
import { ErrorCodes } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { TokenRefreshService } from './token-refresh.js'
import type { ActivityRecord, AgentAuthQueries, UserRecord } from '../repository/index.js'
import type { SignInResult } from '../types.js'
import type { AgentTokenIssuer } from './token-issuer.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const makeService = ({
  userEnabled = true,
  activityExists = true,
}: {
  userEnabled?: boolean
  activityExists?: boolean
} = {}) => {
  const user = {
    id: uuidv7(),
    is_enabled: userEnabled,
  } as UserRecord
  const activity = {
    id: uuidv7(),
    url: 'https://content.test/activity',
  } as ActivityRecord
  let issued: SignInResult | undefined
  const service = new TokenRefreshService({
    logger,
    queries: {
      getUser: async () => user,
      getActivity: async () => (activityExists ? activity : undefined),
    } as unknown as AgentAuthQueries,
    tokenIssuer: {
      createAccessToken: async (result: SignInResult) => {
        issued = result
        return 'renewed-token'
      },
    } as AgentTokenIssuer,
  })

  return { service, user, activity, getIssued: () => issued }
}

describe('TokenRefreshService scope preservation', () => {
  it('copies the verified scope claim without inferring a new scope', async () => {
    const scopeId = uuidv7()
    const { service, user, activity, getIssued } = makeService()

    const token = await service.refreshToken(new AgentAuth(user.id, activity.id, scopeId, 0))

    assert.equal(token, 'renewed-token')
    assert.equal(getIssued()?.scope_id, scopeId)
  })

  it('does not renew before the verified renewal time', async () => {
    const { service, user, activity, getIssued } = makeService()
    const renewAfter = Math.floor(Date.now() / 1000) + 60

    const token = await service.refreshToken(
      new AgentAuth(user.id, activity.id, uuidv7(), renewAfter)
    )

    assert.equal(token, undefined)
    assert.equal(getIssued(), undefined)
  })

  it('still rejects renewal for a disabled user', async () => {
    const { service, user, activity } = makeService({ userEnabled: false })

    await assert.rejects(
      service.refreshToken(new AgentAuth(user.id, activity.id, uuidv7(), 0)),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.UNAUTHORIZED)
        return true
      }
    )
  })

  it('still rejects renewal for a missing activity', async () => {
    const { service, user, activity } = makeService({ activityExists: false })

    await assert.rejects(
      service.refreshToken(new AgentAuth(user.id, activity.id, uuidv7(), 0)),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.UNAUTHORIZED)
        return true
      }
    )
  })
})
