import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { ErrorCodes } from '@/modules/activity-registration/errors.js'
import { parseAdmissibleUrl } from '@/modules/activity-registration/url-policy.js'
import { ActivityService } from './activity.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreError } from '@/lib/errors.js'
import type { ActivityRecord } from '@/modules/activity-registration/repository/index.js'
import type {
  PolicySnapshot,
  RejectedRegistration,
} from '@/modules/activity-registration/schemas.js'
import type {
  ActivityRegistrationService,
  RegistrationOutcome,
} from '@/modules/activity-registration/services/activity-registration.js'
import type { ActivityCodeRecord, ActivityMutations, ActivityQueries } from '../repository/index.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const USER_ID = uuidv7()
const userAuth = new UserAuth(USER_ID, [])

const activityRecord = (url: string): ActivityRecord => ({
  id: uuidv7(),
  url,
  name: null,
  created_at: new Date(),
  updated_at: new Date(),
})

const activityCodeRecord = (): ActivityCodeRecord => ({
  id: uuidv7(),
  created_by: USER_ID,
  code: 'brave-otter',
  private_code: 'private',
  url_prefix: null,
  description: null,
  created_at: new Date(),
  updated_at: new Date(),
})

/**
 * Builds the service over fakes.
 *
 * `known` is the set of URLs that already have an activity row, and `allowed`
 * is the prospective policy. Keeping them separate is the point: the tests
 * below turn on a URL being known *without* being allowed, which is what
 * grandfathering means.
 */
const makeService = ({
  known = [],
  allowed = [],
  existingCode = activityCodeRecord(),
  isMember = true,
}: {
  known?: string[]
  allowed?: string[]
  existingCode?: ActivityCodeRecord
  isMember?: boolean
} = {}) => {
  const rows = new Map(known.map((url) => [url, activityRecord(url)]))
  const assigned: string[] = []
  let removedAssociations = 0
  let policyLoads = 0

  const registration = {
    loadPolicy: async (): Promise<PolicySnapshot> => {
      policyLoads += 1
      return { rules: allowed.map((origin) => ({ origin, path_prefix: '/' })) }
    },
    register: async (url: string, policy: PolicySnapshot): Promise<RegistrationOutcome> => {
      // Known first, with no policy consulted -- the grandfathering order.
      const existing = rows.get(url)
      if (existing !== undefined) {
        return { ok: true, activity: existing }
      }

      // The real parser, not an approximation of it, so the fake cannot
      // disagree with production about what `malformed_url` means.
      const candidate = parseAdmissibleUrl(url)
      if (candidate === null) {
        return { ok: false, url, reason: 'malformed_url' }
      }
      if (!policy.rules.some((rule) => rule.origin === candidate.origin)) {
        return { ok: false, url, reason: 'activity_url_not_allowed' }
      }

      const created = activityRecord(url)
      rows.set(url, created)
      return { ok: true, activity: created }
    },
  } as unknown as ActivityRegistrationService

  const service = new ActivityService({
    logger,
    tx: { withTransaction: async <T>(fn: () => Promise<T>) => await fn() } as TXManager,
    queries: {
      findActivityCodeById: async () => existingCode,
      isMember: async () => isMember,
      findActivitiesByURL: async () => {
        throw new Error('findActivitiesByURL must not be used: registration returns the rows')
      },
    } as unknown as ActivityQueries,
    mutations: {
      createActivityCode: async () => existingCode,
      updateActivityCode: async () => existingCode,
      addMember: async () => {},
      removeActivitiesFromActivityCode: async () => {
        removedAssociations += 1
      },
      assignActivitiesToActivityCode: async (
        _code: ActivityCodeRecord,
        activities: ActivityRecord[]
      ) => {
        assigned.push(...activities.map(({ url }) => url))
      },
      ensureActivitiesExist: async () => {
        throw new Error('ensureActivitiesExist must not be used: registration is the only writer')
      },
    } as unknown as ActivityMutations,
    activityRegistration: { service: registration },
  })

  return {
    service,
    assigned,
    counts: () => ({ policyLoads, removedAssociations }),
    isKnown: (url: string) => rows.has(url),
  }
}

const rejectedFrom = (error: CoreError): RejectedRegistration[] =>
  (error.details as { rejected: RejectedRegistration[] }).rejected

describe('ActivityService.createActivityCode', () => {
  it('succeeds with all-known urls even when the policy is empty', async () => {
    // The mitigation for "an instructor cannot save an unrelated edit". Every
    // URL already has an activity, so no policy evaluation applies to any of
    // them, and an empty policy changes nothing.
    const urls = ['https://legacy.test/a', 'https://legacy.test/b']
    const { service, assigned } = makeService({ known: urls, allowed: [] })

    await service.createActivityCode(userAuth, { code: 'brave-otter', urls })

    assert.deepEqual(assigned.sort(), [...urls].sort())
  })

  it('registers an unseen allowed url and associates it', async () => {
    const { service, assigned, isKnown } = makeService({ allowed: ['https://content.test'] })

    await service.createActivityCode(userAuth, {
      code: 'brave-otter',
      urls: ['https://content.test/new'],
    })

    assert.deepEqual(assigned, ['https://content.test/new'])
    assert.equal(isKnown('https://content.test/new'), true)
  })

  it('names every rejected url, not just the first', async () => {
    // A rejected submission has to identify all the offending URLs: the
    // instructor is going to fix them in one form.
    const { service, assigned } = makeService({
      known: ['https://content.test/known'],
      allowed: ['https://content.test'],
    })

    await assert.rejects(
      service.createActivityCode(userAuth, {
        code: 'brave-otter',
        urls: [
          'https://content.test/known',
          'https://elsewhere.test/one',
          'https://content.test/allowed',
          'https://elsewhere.test/two',
        ],
      }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
        assert.deepEqual(rejectedFrom(error), [
          { url: 'https://elsewhere.test/one', reason: 'activity_url_not_allowed' },
          { url: 'https://elsewhere.test/two', reason: 'activity_url_not_allowed' },
        ])
        return true
      }
    )

    // Nothing was associated, not even the URLs that would have been allowed.
    assert.deepEqual(assigned, [])
  })

  it('reports a malformed url with its own reason', async () => {
    const { service } = makeService({ allowed: ['https://content.test'] })

    await assert.rejects(
      service.createActivityCode(userAuth, {
        code: 'brave-otter',
        urls: ['javascript:alert(1)'],
      }),
      (error: CoreError) => {
        assert.deepEqual(rejectedFrom(error), [
          { url: 'javascript:alert(1)', reason: 'malformed_url' },
        ])
        return true
      }
    )
  })

  it('loads the policy exactly once for a five-url submission', async () => {
    const urls = [1, 2, 3, 4, 5].map((n) => `https://content.test/page-${n}`)
    const { service, counts } = makeService({ allowed: ['https://content.test'] })

    await service.createActivityCode(userAuth, { code: 'brave-otter', urls })

    assert.equal(counts().policyLoads, 1)
  })

  it('registers urls in a stable order regardless of submission order', async () => {
    // Every transaction must take row locks in the same order, or two
    // instructors sharing unseen URLs can deadlock and have one aborted.
    const first = makeService({ allowed: ['https://content.test'] })
    await first.service.createActivityCode(userAuth, {
      code: 'brave-otter',
      urls: ['https://content.test/b', 'https://content.test/a', 'https://content.test/c'],
    })

    const second = makeService({ allowed: ['https://content.test'] })
    await second.service.createActivityCode(userAuth, {
      code: 'brave-otter',
      urls: ['https://content.test/c', 'https://content.test/a', 'https://content.test/b'],
    })

    assert.deepEqual(first.assigned, second.assigned)
    assert.deepEqual(first.assigned, [
      'https://content.test/a',
      'https://content.test/b',
      'https://content.test/c',
    ])
  })
})

describe('ActivityService.updateActivityCode', () => {
  it('succeeds on a description-only edit when the policy now matches nothing', async () => {
    // The exact regression the resolve-first ordering exists to prevent: the
    // code contains a grandfathered URL, and the instructor is editing the
    // description. Requiring the submitted set to match current rules would
    // make them delete their own content to save an unrelated field.
    const urls = ['https://long-forgotten.test/course']
    const { service, assigned } = makeService({ known: urls, allowed: [] })

    const code = await service.updateActivityCode(userAuth, {
      id: uuidv7(),
      description: 'a new description',
      urls,
    })

    assert.ok(code)
    assert.deepEqual(assigned, urls)
  })

  it('restores a previously removed known activity with an empty policy', async () => {
    const urls = ['https://long-forgotten.test/course']
    const { service, assigned, counts } = makeService({ known: urls, allowed: [] })

    await service.updateActivityCode(userAuth, { id: uuidv7(), urls })

    // Associations are removed and re-created wholesale; a known activity is
    // re-associated without any sitewide check.
    assert.equal(counts().removedAssociations, 1)
    assert.deepEqual(assigned, urls)
  })

  it('refuses an unseen disallowed url added to an existing code', async () => {
    const { service, counts } = makeService({
      known: ['https://legacy.test/a'],
      allowed: [],
    })

    await assert.rejects(
      service.updateActivityCode(userAuth, {
        id: uuidv7(),
        urls: ['https://legacy.test/a', 'https://elsewhere.test/new'],
      }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
        assert.deepEqual(rejectedFrom(error), [
          { url: 'https://elsewhere.test/new', reason: 'activity_url_not_allowed' },
        ])
        return true
      }
    )

    // The denial is raised before the associations are torn down, so the
    // rollback has nothing to undo on that front either.
    assert.equal(counts().removedAssociations, 0)
  })

  it('loads the policy exactly once for a five-url submission', async () => {
    const urls = [1, 2, 3, 4, 5].map((n) => `https://content.test/page-${n}`)
    const { service, counts } = makeService({ allowed: ['https://content.test'] })

    await service.updateActivityCode(userAuth, { id: uuidv7(), urls })

    assert.equal(counts().policyLoads, 1)
  })
})
