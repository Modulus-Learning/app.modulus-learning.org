import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { ErrorCodes } from '../errors.js'
import { activityLaunchViewRequestSchema, activityLaunchViewResponseSchema } from '../schemas.js'
import { ActivityLaunchViewService } from './activity-launch-view.js'
import type { Config } from '@/config.js'
import type { ActivityQueries } from '../repository/index.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const createService = ({
  user = 'present',
  activity = 'present',
  scope = 'present',
  scopeName = null,
}: {
  /** When 'missing', the learner does not resolve. */
  user?: 'present' | 'missing'
  /** When 'missing', the activity id does not resolve. */
  activity?: 'present' | 'missing'
  /** When 'missing', the scope id does not resolve. */
  scope?: 'present' | 'missing'
  scopeName?: string | null
} = {}) => {
  const userId = uuidv7()
  const activityId = uuidv7()
  const activityUrl = 'https://content.test/activity?existing=one#authored'

  const service = new ActivityLaunchViewService({
    logger,
    config: { server: { baseUrl: 'https://modulus.test' } } as Config,
    queries: {
      getUser: async () =>
        user === 'missing' ? undefined : { id: userId, full_name: 'Test Learner' },
      findActivityById: async (id: string) =>
        activity === 'missing'
          ? undefined
          : {
              id,
              name: 'Test Activity',
              url: activityUrl,
            },
      findScopeById: async (id: string) =>
        scope === 'missing'
          ? undefined
          : {
              id,
              platform_id: id === DEFAULT_SCOPE_ID ? null : uuidv7(),
              external_id: id === DEFAULT_SCOPE_ID ? null : 'term-1',
              name: scopeName,
              starts_at: null,
              ends_at: null,
              last_verified_launch_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
    } as unknown as ActivityQueries,
  })

  return { service, userId, activityId, activityUrl }
}

describe('ActivityLaunchViewService', () => {
  it('returns the launch view for a valid activity and scope pair', async () => {
    const scopeId = uuidv7()
    const { service, userId, activityId, activityUrl } = createService({
      scopeName: 'Autumn 2026',
    })

    const result = await service.getActivityLaunchView(new UserAuth(userId, []), {
      activity_id: activityId,
      scope_id: scopeId,
    })

    assert.deepEqual(result, {
      user: { id: userId, full_name: 'Test Learner' },
      activity: { id: activityId, name: 'Test Activity', url: activityUrl },
      scope_id: scopeId,
      scope_name: 'Autumn 2026',
      modulus_server_url: 'https://modulus.test',
    })
    assert.equal(activityLaunchViewResponseSchema.safeParse(result).success, true)
  })

  it('returns the canonical metadata-free default scope', async () => {
    const { service, userId, activityId } = createService({ scopeName: null })

    const result = await service.getActivityLaunchView(new UserAuth(userId, []), {
      activity_id: activityId,
      scope_id: DEFAULT_SCOPE_ID,
    })

    assert.equal(result.scope_id, DEFAULT_SCOPE_ID)
    assert.equal(result.scope_name, null)
  })

  it('rejects an unknown learner', async () => {
    const { service, userId, activityId } = createService({ user: 'missing' })

    await assert.rejects(
      service.getActivityLaunchView(new UserAuth(userId, []), {
        activity_id: activityId,
        scope_id: uuidv7(),
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.LEARNER_NOT_FOUND)
        return true
      }
    )
  })

  it('rejects an unknown activity id', async () => {
    const { service, userId, activityId } = createService({ activity: 'missing' })

    await assert.rejects(
      service.getActivityLaunchView(new UserAuth(userId, []), {
        activity_id: activityId,
        scope_id: uuidv7(),
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.ACTIVITY_NOT_FOUND)
        return true
      }
    )
  })

  it('rejects an unknown scope id', async () => {
    const { service, userId, activityId } = createService({ scope: 'missing' })

    await assert.rejects(
      service.getActivityLaunchView(new UserAuth(userId, []), {
        activity_id: activityId,
        scope_id: uuidv7(),
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.ACTIVITY_SCOPE_NOT_FOUND)
        return true
      }
    )
  })

  // Characterization guard, not a regression test. The service never looks at
  // activity codes, so the fake queries object below has no way to express an
  // association at all -- this case proves nothing about today's behaviour and
  // exists to fail loudly if someone later adds a code check here. The
  // stricter-than-the-handler defect itself is exercised at the boundaries: the
  // preserved 'retired-code' case in the LTI launch service tests, and the
  // launch route's destination tests.
  it('returns the launch view for an activity associated with no activity code (guard)', async () => {
    const scopeId = uuidv7()
    const { service, userId, activityId, activityUrl } = createService({
      scopeName: 'Autumn 2026',
    })

    const result = await service.getActivityLaunchView(new UserAuth(userId, []), {
      activity_id: activityId,
      scope_id: scopeId,
    })

    assert.equal(result.activity.id, activityId)
    assert.equal(result.activity.url, activityUrl)
  })

  it('requires structurally valid ids at the command boundary', () => {
    assert.equal(
      activityLaunchViewRequestSchema.safeParse({
        activity_id: 'not-a-uuid',
        scope_id: DEFAULT_SCOPE_ID,
      }).success,
      false
    )
    assert.equal(
      activityLaunchViewRequestSchema.safeParse({
        activity_id: uuidv7(),
        scope_id: 'not-a-uuid',
      }).success,
      false
    )
  })

  it('rejects an activity code at the command boundary', () => {
    const parsed = activityLaunchViewRequestSchema.safeParse({
      activity_id: uuidv7(),
      scope_id: DEFAULT_SCOPE_ID,
      activity_code: 'course-code',
    })

    assert.equal(parsed.success, false)
  })
})
