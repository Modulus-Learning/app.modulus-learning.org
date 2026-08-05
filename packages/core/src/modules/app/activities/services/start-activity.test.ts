import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { ErrorCodes } from '../errors.js'
import { startActivityRequestSchema } from '../schemas.js'
import { StartActivityService } from './start-activity.js'
import type { Config } from '@/config.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const createService = ({ scopeId, scopeName }: { scopeId?: string; scopeName?: string | null }) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  const activityId = uuidv7()
  const activityUrl = 'https://content.test/activity?existing=one#authored'
  const enrollments: string[][] = []

  const service = new StartActivityService({
    logger,
    config: { server: { baseUrl: 'https://modulus.test' } } as Config,
    queries: {
      getUser: async () => ({ id: userId, full_name: 'Test Learner' }),
      findActivityCodeByPublicCode: async () => ({
        id: activityCodeId,
        code: 'course-code',
      }),
      findActivityByURL: async () => ({
        id: activityId,
        name: 'Test Activity',
        url: activityUrl,
      }),
      findScopeById: async (id: string) =>
        scopeId == null
          ? undefined
          : {
              id,
              platform_id: scopeId === DEFAULT_SCOPE_ID ? null : uuidv7(),
              external_id: scopeId === DEFAULT_SCOPE_ID ? null : 'term-1',
              name: scopeName ?? null,
              starts_at: null,
              ends_at: null,
              last_verified_launch_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
    } as unknown as ActivityQueries,
    mutations: {
      enrollInActivity: async (...values: string[]) => {
        enrollments.push(values)
      },
    } as unknown as ActivityMutations,
  })

  return {
    service,
    userId,
    activityCodeId,
    activityId,
    activityUrl,
    enrollments,
  }
}

describe('StartActivityService', () => {
  it('returns canonical named scope metadata with the existing enrollment result', async () => {
    const scopeId = uuidv7()
    const { service, userId, activityCodeId, activityId, activityUrl, enrollments } = createService(
      {
        scopeId,
        scopeName: 'Autumn 2026',
      }
    )

    const result = await service.startActivity(new UserAuth(userId, []), {
      activity_code: 'course-code',
      activity_url: activityUrl,
      scope_id: scopeId,
    })

    assert.equal(result.scope_id, scopeId)
    assert.equal(result.scope_name, 'Autumn 2026')
    assert.equal(result.activity.id, activityId)
    assert.equal(result.modulus_server_url, 'https://modulus.test')
    assert.deepEqual(enrollments, [[userId, activityCodeId, activityId]])
  })

  it('returns the canonical metadata-free default scope', async () => {
    const { service, userId, activityUrl } = createService({
      scopeId: DEFAULT_SCOPE_ID,
      scopeName: null,
    })

    const result = await service.startActivity(new UserAuth(userId, []), {
      activity_code: 'course-code',
      activity_url: activityUrl,
      scope_id: DEFAULT_SCOPE_ID,
    })

    assert.equal(result.scope_id, DEFAULT_SCOPE_ID)
    assert.equal(result.scope_name, null)
  })

  it('rejects an unknown scope without enrolling the learner', async () => {
    const requestedScopeId = uuidv7()
    const { service, userId, activityUrl, enrollments } = createService({})

    await assert.rejects(
      service.startActivity(new UserAuth(userId, []), {
        activity_code: 'course-code',
        activity_url: activityUrl,
        scope_id: requestedScopeId,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.ACTIVITY_SCOPE_NOT_FOUND)
        return true
      }
    )
    assert.deepEqual(enrollments, [])
  })

  it('requires a structurally valid scope id at the command boundary', () => {
    const parsed = startActivityRequestSchema.safeParse({
      activity_code: 'course-code',
      activity_url: 'https://content.test/activity',
      scope_id: 'not-a-uuid',
    })

    assert.equal(parsed.success, false)
  })
})
