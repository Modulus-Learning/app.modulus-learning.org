import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { ErrorCodes } from '../errors.js'
import { startActivityRequestSchema, startActivityResponseSchema } from '../schemas.js'
import { StartActivityService } from './start-activity.js'
import type { Config } from '@/config.js'
import type { ActivityQueries } from '../repository/index.js'
import type { EnrollmentOutcome, EnrollmentService } from './enrollment.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const createService = ({
  scopeId,
  scopeName,
  activityCode,
  enrollmentOutcome,
}: {
  scopeId?: string
  scopeName?: string | null
  /** When explicitly null, the public code does not resolve. */
  activityCode?: { id: string; code: string } | null
  enrollmentOutcome?: EnrollmentOutcome
}) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  const activityId = uuidv7()
  const activityUrl = 'https://content.test/activity?existing=one#authored'
  const enrollments: { user_id: string; activity_code_id: string; activity_id: string }[] = []

  const service = new StartActivityService({
    logger,
    config: { server: { baseUrl: 'https://modulus.test' } } as Config,
    queries: {
      getUser: async () => ({ id: userId, full_name: 'Test Learner' }),
      findActivityCodeByPublicCode: async () =>
        activityCode === null
          ? undefined
          : (activityCode ?? { id: activityCodeId, code: 'course-code' }),
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
    enrollmentService: {
      enrollByActivityCodeId: async (params: {
        user_id: string
        activity_code_id: string
        activity_id: string
      }): Promise<EnrollmentOutcome> => {
        enrollments.push(params)
        return (
          enrollmentOutcome ?? { status: 'enrolled', activity_code_id: params.activity_code_id }
        )
      },
      enrollByPublicActivityCode: async (): Promise<EnrollmentOutcome> => {
        throw new Error('startActivity must not enroll by public activity code')
      },
    } as unknown as EnrollmentService,
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
    assert.deepEqual(enrollments, [
      { user_id: userId, activity_code_id: activityCodeId, activity_id: activityId },
    ])
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

  it('returns the complete response when the shared service skips an unassociated activity', async () => {
    const scopeId = uuidv7()
    const { service, userId, activityCodeId, activityId, activityUrl, enrollments } = createService(
      {
        scopeId,
        scopeName: 'Autumn 2026',
        enrollmentOutcome: { status: 'skipped', reason: 'activity_not_in_activity_code' },
      }
    )

    const result = await service.startActivity(new UserAuth(userId, []), {
      activity_code: 'course-code',
      activity_url: activityUrl,
      scope_id: scopeId,
    })

    // The launch is honoured in full; only the enrollment write is skipped.
    assert.equal(result.scope_id, scopeId)
    assert.equal(result.scope_name, 'Autumn 2026')
    assert.equal(result.activity.id, activityId)
    assert.equal(result.activity_code.id, activityCodeId)
    assert.equal(result.modulus_server_url, 'https://modulus.test')
    assert.deepEqual(enrollments, [
      { user_id: userId, activity_code_id: activityCodeId, activity_id: activityId },
    ])
  })

  it('rejects an unknown public activity code before reaching the enrollment operation', async () => {
    const scopeId = uuidv7()
    const { service, userId, activityUrl, enrollments } = createService({
      scopeId,
      activityCode: null,
    })

    await assert.rejects(
      service.startActivity(new UserAuth(userId, []), {
        activity_code: 'retired-code',
        activity_url: activityUrl,
        scope_id: scopeId,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.ACTIVITY_CODE_NOT_FOUND)
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

  it('requires an absolute activity URL at the command boundary', () => {
    const request = startActivityRequestSchema.safeParse({
      activity_code: 'course-code',
      activity_url: 'not-an-absolute-url',
      scope_id: DEFAULT_SCOPE_ID,
    })
    const response = startActivityResponseSchema.safeParse({
      user: { id: uuidv7() },
      activity_code: { id: uuidv7(), code: 'course-code' },
      activity: { id: uuidv7(), url: 'not-an-absolute-url' },
      scope_id: DEFAULT_SCOPE_ID,
      scope_name: null,
      modulus_server_url: 'https://modulus.test',
    })

    assert.equal(request.success, false)
    assert.equal(response.success, false)
  })
})
