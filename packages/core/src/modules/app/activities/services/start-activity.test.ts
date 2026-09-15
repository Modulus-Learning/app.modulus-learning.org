import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import { ErrorCodes } from '../errors.js'
import { startActivityRequestSchema, startActivityResponseSchema } from '../schemas.js'
import { StartActivityService } from './start-activity.js'
import type { Config } from '@/config.js'
import type { ActivityQueries } from '../repository/index.js'
import type { EnrollmentOutcome, EnrollmentService } from './enrollment.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

/** The canonical URL stored on the fake's only `activities` row. */
const STORED_ACTIVITY_URL = 'https://content.test/activity'

const createService = ({
  scopeId,
  scopeName,
  activityCode,
  enrollmentOutcome,
  storedActivityUrl = STORED_ACTIVITY_URL,
}: {
  scopeId?: string
  scopeName?: string | null
  /** When explicitly null, the public code does not resolve. */
  activityCode?: { id: string; code: string } | null
  enrollmentOutcome?: EnrollmentOutcome
  /**
   * The `url` of the only stored activity. `findActivityByURL` resolves it by
   * SQL-style exact equality, so a raw spelling passed to the fake misses.
   */
  storedActivityUrl?: string
}) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  const activityId = uuidv7()
  const activityUrl = storedActivityUrl
  const enrollments: { user_id: string; activity_code_id: string; activity_id: string }[] = []
  /** Every key passed to `findActivityByURL`, in order. */
  const lookups: string[] = []

  const service = new StartActivityService({
    logger,
    config: { server: { baseUrl: 'https://modulus.test' } } as Config,
    queries: {
      getUser: async () => ({ id: userId, full_name: 'Test Learner' }),
      findActivityCodeByPublicCode: async () =>
        activityCode === null
          ? undefined
          : (activityCode ?? { id: activityCodeId, code: 'course-code' }),
      findActivityByURL: async (url: string) => {
        lookups.push(url)
        return url === activityUrl
          ? { id: activityId, name: 'Test Activity', url: activityUrl }
          : undefined
      },
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
    lookups,
  }
}

const rejectsWithCode = (code: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, code)
  return true
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

  describe('canonical activity lookup', () => {
    const variants = [
      { name: 'an uppercase scheme and host', url: 'HTTPS://CONTENT.TEST/activity' },
      { name: 'an explicit default port', url: 'https://content.test:443/activity' },
      { name: 'dot segments', url: 'https://content.test/unit/./../activity' },
      { name: 'an encoded dot segment', url: 'https://content.test/unit/%2e%2E/activity' },
      { name: 'a query', url: 'https://content.test/activity?page=2&token=synthetic' },
      { name: 'a fragment', url: 'https://content.test/activity#section-3' },
      { name: 'an empty query and fragment', url: 'https://content.test/activity?#' },
    ]

    for (const { name, url } of variants) {
      it(`resolves the stored activity from a url with ${name}`, async () => {
        const scopeId = uuidv7()
        const { service, userId, activityCodeId, activityId, enrollments, lookups } = createService(
          { scopeId }
        )

        const result = await service.startActivity(new UserAuth(userId, []), {
          activity_code: 'course-code',
          activity_url: url,
          scope_id: scopeId,
        })

        assert.deepEqual(lookups, [STORED_ACTIVITY_URL])
        assert.equal(result.activity.id, activityId)
        // The destination is the stored row's URL: nothing from the incoming
        // query or fragment is forwarded.
        assert.equal(result.activity.url, STORED_ACTIVITY_URL)
        assert.equal(result.activity.url.includes('?'), false)
        assert.equal(result.activity.url.includes('#'), false)
        assert.deepEqual(enrollments, [
          { user_id: userId, activity_code_id: activityCodeId, activity_id: activityId },
        ])
      })
    }

    it('completes the root path of an origin-only url', async () => {
      const scopeId = uuidv7()
      const storedActivityUrl = 'https://content.test/'
      const { service, userId, activityId, lookups } = createService({
        scopeId,
        storedActivityUrl,
      })

      const result = await service.startActivity(new UserAuth(userId, []), {
        activity_code: 'course-code',
        activity_url: 'https://CONTENT.test:443?launch=1',
        scope_id: scopeId,
      })

      assert.deepEqual(lookups, [storedActivityUrl])
      assert.equal(result.activity.id, activityId)
      assert.equal(result.activity.url, storedActivityUrl)
    })

    // These spellings reach the service intact only when a caller passes them
    // intact. Generated direct-start links still lose them in route extraction
    // before lookup; this test does not change that.
    it('keeps non-root trailing and repeated slashes significant', async () => {
      const scopeId = uuidv7()
      const { service, userId, enrollments, lookups } = createService({ scopeId })

      for (const url of ['https://content.test/activity/', 'https://content.test//activity']) {
        await assert.rejects(
          service.startActivity(new UserAuth(userId, []), {
            activity_code: 'course-code',
            activity_url: url,
            scope_id: scopeId,
          }),
          rejectsWithCode(ErrorCodes.ACTIVITY_NOT_FOUND)
        )
      }

      assert.deepEqual(lookups, [
        'https://content.test/activity/',
        'https://content.test//activity',
      ])
      assert.deepEqual(enrollments, [])
    })

    it('rejects an unknown activity without enrolling the learner', async () => {
      const scopeId = uuidv7()
      const { service, userId, enrollments, lookups } = createService({ scopeId })

      await assert.rejects(
        service.startActivity(new UserAuth(userId, []), {
          activity_code: 'course-code',
          activity_url: 'https://content.test/other?x=1',
          scope_id: scopeId,
        }),
        rejectsWithCode(ErrorCodes.ACTIVITY_NOT_FOUND)
      )

      // Exactly one lookup, by the canonical key: no raw or near-match retry.
      assert.deepEqual(lookups, ['https://content.test/other'])
      assert.deepEqual(enrollments, [])
    })

    it('maps an unparseable url to activity-not-found without a lookup', async () => {
      const scopeId = uuidv7()
      const { service, userId, enrollments, lookups } = createService({ scopeId })

      await assert.rejects(
        service.startActivity(new UserAuth(userId, []), {
          activity_code: 'course-code',
          activity_url: 'https://content test/activity',
          scope_id: scopeId,
        }),
        rejectsWithCode(ErrorCodes.ACTIVITY_NOT_FOUND)
      )

      assert.deepEqual(lookups, [])
      assert.deepEqual(enrollments, [])
    })
  })

  it('accepts a raw activity URL longer than 256 whose canonical key fits storage', () => {
    const activity_url = `https://content.test/activity?${'q'.repeat(300)}#${'f'.repeat(20)}`
    const key = normalizeActivityUrl(activity_url)
    assert.ok(activity_url.length > 256)
    assert.ok(key !== null && key.length <= 255)

    const parsed = startActivityRequestSchema.safeParse({
      activity_code: 'course-code',
      activity_url,
      scope_id: DEFAULT_SCOPE_ID,
    })

    assert.equal(parsed.success, true)
    // A refinement, not a transform: the service derives the key itself.
    assert.equal(parsed.data?.activity_url, activity_url)
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
