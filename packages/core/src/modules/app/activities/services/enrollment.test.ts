import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'

import { EnrollmentService } from './enrollment.js'
import type { CoreLogger, LogData } from '@/lib/logger.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'

type CapturedWarning = { payload: LogData; message: string | undefined }

/**
 * A logger that records `warn` calls so tests can assert both the diagnostic
 * and, crucially, that its payload carries no learner PII. Every other level is
 * a no-op -- `BaseService`'s `@method` decorator logs entry and exit at trace.
 */
const createCapturingLogger = () => {
  const warnings: CapturedWarning[] = []
  const noop = () => {}
  const logger: CoreLogger = {
    log: noop,
    fatal: noop,
    error: noop,
    warn: (...args: Parameters<CoreLogger['warn']>) => {
      const [first, second] = args
      warnings.push({
        payload: typeof first === 'string' ? {} : first,
        message: typeof first === 'string' ? first : (second as string | undefined),
      })
    },
    info: noop,
    debug: noop,
    trace: noop,
    silent: noop,
  }
  return { logger, warnings }
}

const createService = ({
  activityCode,
  associated = true,
  associationError,
  insertError,
}: {
  activityCode?: { id: string; code: string }
  associated?: boolean
  associationError?: Error
  insertError?: Error
} = {}) => {
  const enrollments: { user_id: string; activity_code_id: string }[] = []
  const associationLookups: { activity_code_id: string; activity_id: string }[] = []
  const { logger, warnings } = createCapturingLogger()

  const service = new EnrollmentService({
    logger,
    queries: {
      findActivityCodeByPublicCode: async () => activityCode,
      isActivityInActivityCode: async (activity_code_id: string, activity_id: string) => {
        associationLookups.push({ activity_code_id, activity_id })
        if (associationError != null) {
          throw associationError
        }
        return associated
      },
    } as unknown as ActivityQueries,
    mutations: {
      enrollInActivityCode: async (user_id: string, activity_code_id: string) => {
        if (insertError != null) {
          throw insertError
        }
        enrollments.push({ user_id, activity_code_id })
      },
    } as unknown as ActivityMutations,
  })

  return { service, enrollments, associationLookups, warnings }
}

describe('EnrollmentService.enrollByActivityCodeId', () => {
  it('enrolls a learner once when the activity is associated with the code', async () => {
    const { service, enrollments, warnings } = createService()
    const user_id = uuidv7()
    const activity_code_id = uuidv7()
    const activity_id = uuidv7()

    const outcome = await service.enrollByActivityCodeId({
      user_id,
      activity_code_id,
      activity_id,
    })

    assert.deepEqual(outcome, { status: 'enrolled', activity_code_id })
    assert.deepEqual(enrollments, [{ user_id, activity_code_id }])
    assert.deepEqual(warnings, [])
  })

  it('stores only the learner and the code, never the activity', async () => {
    const { service, enrollments } = createService()
    const user_id = uuidv7()
    const activity_code_id = uuidv7()

    await service.enrollByActivityCodeId({
      user_id,
      activity_code_id,
      activity_id: uuidv7(),
    })

    assert.deepEqual(Object.keys(enrollments[0] ?? {}).sort(), ['activity_code_id', 'user_id'])
  })

  it('performs a second conflict-tolerant insert on a repeat launch and still reports enrolled', async () => {
    const { service, enrollments } = createService()
    const user_id = uuidv7()
    const activity_code_id = uuidv7()
    const activity_id = uuidv7()

    const first = await service.enrollByActivityCodeId({ user_id, activity_code_id, activity_id })
    const second = await service.enrollByActivityCodeId({ user_id, activity_code_id, activity_id })

    assert.deepEqual(first, { status: 'enrolled', activity_code_id })
    assert.deepEqual(second, { status: 'enrolled', activity_code_id })
    // The insert is repeated -- `onConflictDoNothing` in the repository, and the
    // integration suite, are what make the repeat harmless and leave
    // `created_at` untouched.
    assert.deepEqual(enrollments, [
      { user_id, activity_code_id },
      { user_id, activity_code_id },
    ])
  })

  it('skips without writing, and warns once, when the activity is not associated', async () => {
    const { service, enrollments, warnings } = createService({ associated: false })
    const activity_code_id = uuidv7()
    const activity_id = uuidv7()

    const outcome = await service.enrollByActivityCodeId({
      user_id: uuidv7(),
      activity_code_id,
      activity_id,
    })

    assert.deepEqual(outcome, { status: 'skipped', reason: 'activity_not_in_activity_code' })
    assert.deepEqual(enrollments, [])
    assert.equal(warnings.length, 1)
    assert.deepEqual(warnings[0]?.payload, { activity_code_id, activity_id })
    assert.equal(
      warnings[0]?.message,
      'enrollment skipped: activity not associated with activity code'
    )
  })

  it('propagates a repository failure from the association check', async () => {
    const associationError = new Error('association lookup failed')
    const { service, enrollments } = createService({ associationError })

    await assert.rejects(
      service.enrollByActivityCodeId({
        user_id: uuidv7(),
        activity_code_id: uuidv7(),
        activity_id: uuidv7(),
      }),
      associationError
    )
    assert.deepEqual(enrollments, [])
  })

  it('propagates a repository failure from the insert', async () => {
    const insertError = new Error('insert failed')
    const { service } = createService({ insertError })

    await assert.rejects(
      service.enrollByActivityCodeId({
        user_id: uuidv7(),
        activity_code_id: uuidv7(),
        activity_id: uuidv7(),
      }),
      insertError
    )
  })
})

describe('EnrollmentService.enrollByPublicActivityCode', () => {
  it('enrolls using the canonical code id, not the supplied string', async () => {
    const activityCode = { id: uuidv7(), code: 'course-code' }
    const { service, enrollments, associationLookups } = createService({ activityCode })
    const user_id = uuidv7()
    const activity_id = uuidv7()

    const outcome = await service.enrollByPublicActivityCode({
      user_id,
      activity_code: 'course-code',
      activity_id,
    })

    assert.deepEqual(outcome, { status: 'enrolled', activity_code_id: activityCode.id })
    assert.deepEqual(enrollments, [{ user_id, activity_code_id: activityCode.id }])
    assert.deepEqual(associationLookups, [{ activity_code_id: activityCode.id, activity_id }])
  })

  it('skips an unresolvable code without looking up an association or writing', async () => {
    const { service, enrollments, associationLookups, warnings } = createService({
      activityCode: undefined,
    })
    const activity_id = uuidv7()

    const outcome = await service.enrollByPublicActivityCode({
      user_id: uuidv7(),
      activity_code: 'retired-code',
      activity_id,
    })

    assert.deepEqual(outcome, { status: 'skipped', reason: 'unknown_activity_code' })
    assert.deepEqual(associationLookups, [])
    assert.deepEqual(enrollments, [])
    assert.equal(warnings.length, 1)
    assert.deepEqual(warnings[0]?.payload, { activity_code: 'retired-code', activity_id })
    assert.equal(warnings[0]?.message, 'enrollment skipped: activity code not found')
  })

  it('shares the association check with the id-based entry point', async () => {
    const activityCode = { id: uuidv7(), code: 'course-code' }
    const { service, enrollments, warnings } = createService({
      activityCode,
      associated: false,
    })
    const activity_id = uuidv7()

    const outcome = await service.enrollByPublicActivityCode({
      user_id: uuidv7(),
      activity_code: 'course-code',
      activity_id,
    })

    assert.deepEqual(outcome, { status: 'skipped', reason: 'activity_not_in_activity_code' })
    assert.deepEqual(enrollments, [])
    assert.equal(warnings.length, 1)
    assert.deepEqual(warnings[0]?.payload, {
      activity_code_id: activityCode.id,
      activity_id,
    })
  })
})

describe('EnrollmentService diagnostics', () => {
  const PII = [
    'Test Learner',
    'learner@osu.test',
    'lti-subject-1234',
    'student-id-98765',
    'urn:lti:term:autumn-2026',
  ]

  it('emits no learner PII in either skip warning', async () => {
    const activity_id = uuidv7()

    const unknownCode = createService({ activityCode: undefined })
    await unknownCode.service.enrollByPublicActivityCode({
      user_id: uuidv7(),
      activity_code: 'retired-code',
      activity_id,
    })

    const unassociated = createService({ associated: false })
    await unassociated.service.enrollByActivityCodeId({
      user_id: uuidv7(),
      activity_code_id: uuidv7(),
      activity_id,
    })

    const serialized = JSON.stringify([...unknownCode.warnings, ...unassociated.warnings])

    assert.equal(unknownCode.warnings.length, 1)
    assert.equal(unassociated.warnings.length, 1)
    for (const value of PII) {
      assert.ok(!serialized.includes(value), `warn payload leaked ${value}`)
    }
    // Only the code identifier and the activity id are ever carried.
    for (const warning of [...unknownCode.warnings, ...unassociated.warnings]) {
      const keys = Object.keys(warning.payload as Record<string, unknown>).sort()
      assert.ok(
        keys.every((key) => ['activity_code', 'activity_code_id', 'activity_id'].includes(key)),
        `unexpected warn payload keys: ${keys.join(', ')}`
      )
    }
  })
})
