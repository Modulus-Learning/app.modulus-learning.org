import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { AdminAuth } from '@/lib/auth.js'
import { ErrorCodes } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { AdminActivityUrlAllowlistCommands } from '../commands.js'
import { AdminActivityUrlAllowlistService } from './activity-url-allowlist.js'
import type { CoreError } from '@/lib/errors.js'
import type {
  ActivityUrlAllowlistMutations,
  ActivityUrlAllowlistQueries,
  AllowlistRuleInsert,
  AllowlistRuleRecord,
  AllowlistRuleUpdate,
} from '@/modules/activity-registration/repository/index.js'
import type { AllowlistPolicyService } from '@/modules/activity-registration/services/allowlist-policy.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const ADMIN_ID = uuidv7()
const auth = new AdminAuth(ADMIN_ID, [
  'activity-url-allowlist:list',
  'activity-url-allowlist:manage',
])

const ruleRecord = (
  overrides: Partial<AllowlistRuleRecord> & Pick<AllowlistRuleRecord, 'origin'>
): AllowlistRuleRecord => ({
  id: uuidv7(),
  path_prefix: '/',
  description: null,
  is_enabled: true,
  created_by: null,
  updated_by: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

/**
 * Builds the service over fakes that record every write.
 *
 * `writes` is what the collision cases turn on: both `already_enabled` and
 * `disabled_match` are claims that nothing was written, and only the absence of
 * a recorded write can express that.
 */
const makeService = ({
  rules = [],
  activities = [],
  enabledPolicyRules,
  raceWinner,
  createLosesRace = false,
}: {
  rules?: AllowlistRuleRecord[]
  activities?: { id: string; url: string }[]
  /** What `policy.loadPolicy()` reports, for the no-argument preview. */
  enabledPolicyRules?: { origin: string; path_prefix: string }[]
  /**
   * A rule that appears only *after* the insert has been attempted, modelling a
   * concurrent create that landed between the lookup and the re-read. Without
   * this the first lookup would find it and the race path would never run.
   */
  raceWinner?: AllowlistRuleRecord
  /** When true the insert absorbs a conflict and returns nothing, as it does when it loses. */
  createLosesRace?: boolean
} = {}) => {
  const writes: string[] = []
  const created: AllowlistRuleInsert[] = []
  const updated: { id: string; data: AllowlistRuleUpdate }[] = []

  const service = new AdminActivityUrlAllowlistService({
    logger,
    activityRegistration: {
      queries: {
        listRules: async () => rules,
        listActivities: async () => activities,
        findRuleById: async (id: string) => rules.find((rule) => rule.id === id),
        findRuleByBase: async (origin: string, path_prefix: string) => {
          const visible =
            raceWinner !== undefined && writes.includes('createRule')
              ? [...rules, raceWinner]
              : rules
          return visible.find((rule) => rule.origin === origin && rule.path_prefix === path_prefix)
        },
      } as unknown as ActivityUrlAllowlistQueries,
      mutations: {
        createRule: async (data: AllowlistRuleInsert) => {
          writes.push('createRule')
          created.push(data)
          return createLosesRace ? undefined : ruleRecord({ ...data, origin: data.origin })
        },
        updateRule: async (id: string, data: AllowlistRuleUpdate) => {
          writes.push('updateRule')
          updated.push({ id, data })
          const existing = rules.find((rule) => rule.id === id)
          return existing === undefined ? undefined : { ...existing, ...data }
        },
        deleteRule: async (_id: string) => {
          writes.push('deleteRule')
        },
      } as unknown as ActivityUrlAllowlistMutations,
      policy: {
        loadPolicy: async () => ({ rules: enabledPolicyRules ?? [] }),
      } as unknown as AllowlistPolicyService,
    },
  })

  return { service, writes, created, updated }
}

const assertValidationError = async (operation: Promise<unknown>, label: string): Promise<void> => {
  await assert.rejects(
    operation,
    (error: CoreError) => {
      assert.equal(error.code, ErrorCodes.VALIDATION)
      return true
    },
    label
  )
}

describe('AdminActivityUrlAllowlistService.createAllowlistRule', () => {
  it('creates a new base url and stores the normalized pair', async () => {
    const { service, created } = makeService()

    const result = await service.createAllowlistRule(auth, {
      base_url: 'https://ximera.example/course/calculus/',
      description: 'the calculus course',
    })

    assert.equal(result.status, 'created')
    assert.equal(result.rule.base_url, 'https://ximera.example/course/calculus')
    assert.equal(result.rule.is_enabled, true)
    assert.equal(result.rule.created_by, ADMIN_ID)
    assert.equal(created.length, 1)
    assert.equal(created[0]?.origin, 'https://ximera.example')
    assert.equal(created[0]?.path_prefix, '/course/calculus')
    assert.equal(created[0]?.description, 'the calculus course')
  })

  it('reports already_enabled for a normalizing collision, and writes nothing', async () => {
    // The trailing slash normalizes onto the existing rule. This is the whole
    // reason `manage` is one ability rather than create/edit/delete: the
    // administrator asked for a state, and a submission can land on an edit.
    const { service, writes } = makeService({
      rules: [ruleRecord({ origin: 'https://example.edu', path_prefix: '/course/calculus' })],
    })

    const result = await service.createAllowlistRule(auth, {
      base_url: 'https://example.edu/course/calculus/',
    })

    assert.equal(result.status, 'already_enabled')
    assert.equal(result.rule.base_url, 'https://example.edu/course/calculus')
    assert.deepEqual(writes, [])
  })

  it('reports disabled_match with the original description and creator, and writes nothing', async () => {
    const author = uuidv7()
    const { service, writes } = makeService({
      rules: [
        ruleRecord({
          origin: 'https://example.edu',
          path_prefix: '/course/calculus',
          description: 'approved for the pilot',
          is_enabled: false,
          created_by: author,
        }),
      ],
    })

    const result = await service.createAllowlistRule(auth, {
      base_url: 'https://example.edu/course/calculus/',
      description: 'a different note',
    })

    assert.equal(result.status, 'disabled_match')
    // Re-enabling is the administrator's explicit next action, and it must find
    // the rule's own history intact rather than overwritten by this submission.
    assert.equal(result.rule.description, 'approved for the pilot')
    assert.equal(result.rule.created_by, author)
    assert.equal(result.rule.is_enabled, false)
    assert.deepEqual(writes, [])
  })

  it('reports the winner when a concurrent create takes the base first', async () => {
    // The lookup missed, so the insert went ahead -- and lost. Two
    // administrators submitting the same base URL at the same moment must both
    // be told about the resulting state; one of them must not get a
    // unique-violation error for asking.
    const winner = ruleRecord({ origin: 'https://example.edu', path_prefix: '/course/calculus' })
    const { service, writes } = makeService({ createLosesRace: true, raceWinner: winner })

    const result = await service.createAllowlistRule(auth, {
      base_url: 'https://example.edu/course/calculus',
    })

    assert.equal(result.status, 'already_enabled')
    assert.equal(result.rule.id, winner.id)
    // One insert attempt, absorbed. There is no second write.
    assert.deepEqual(writes, ['createRule'])
  })

  it('reports a disabled winner as disabled_match when the create loses the race', async () => {
    const winner = ruleRecord({
      origin: 'https://example.edu',
      path_prefix: '/course/calculus',
      description: 'approved for the pilot',
      is_enabled: false,
    })
    const { service, writes } = makeService({ createLosesRace: true, raceWinner: winner })

    const result = await service.createAllowlistRule(auth, {
      base_url: 'https://example.edu/course/calculus',
    })

    assert.equal(result.status, 'disabled_match')
    assert.equal(result.rule.description, 'approved for the pilot')
    assert.deepEqual(writes, ['createRule'])
  })

  it('raises ERR_UNHANDLED when the create neither inserts nor resolves', async () => {
    // Same shape and same reasoning as the registration service's step 5: the
    // row was created and removed between two statements, which is not a state
    // the administrator can act on.
    const { service } = makeService({ createLosesRace: true })

    await assert.rejects(
      service.createAllowlistRule(auth, { base_url: 'https://example.edu/course/calculus' }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.UNHANDLED)
        return true
      }
    )
  })

  it('rejects a derived base url over 255 characters, though both columns fit', async () => {
    // The bound is on the pair, which neither column width can express: a
    // longer rule could never match a storable `activities.url`, so it would be
    // accepted, listed, and permanently inert.
    const origin = 'https://example.edu'
    const path_prefix = `/${'a'.repeat(250)}`
    const base_url = `${origin}${path_prefix}`

    assert.ok(origin.length <= 255)
    assert.ok(path_prefix.length <= 255)
    assert.ok(base_url.length > 255)

    const { service, writes } = makeService()

    await assertValidationError(service.createAllowlistRule(auth, { base_url }), base_url)
    assert.deepEqual(writes, [])
  })

  it('rejects a url the admission syntax does not accept', async () => {
    const { service, writes } = makeService()

    for (const base_url of [
      'javascript:evil',
      '/relative/path',
      'not-a-url',
      'http://content.example/x',
      'https://user:pass@evil.example/',
    ]) {
      await assertValidationError(service.createAllowlistRule(auth, { base_url }), base_url)
    }

    assert.deepEqual(writes, [])
  })
})

describe('AdminActivityUrlAllowlistService.updateAllowlistRule', () => {
  it('disables a rule without touching its description or creator', async () => {
    const author = uuidv7()
    const existing = ruleRecord({
      origin: 'https://example.edu',
      description: 'approved for the pilot',
      created_by: author,
      updated_by: author,
    })
    const { service, updated } = makeService({ rules: [existing] })

    const result = await service.updateAllowlistRule(auth, {
      id: existing.id,
      is_enabled: false,
    })

    assert.equal(result.rule.is_enabled, false)
    assert.equal(result.rule.updated_by, ADMIN_ID)
    assert.equal(result.rule.description, 'approved for the pilot')
    assert.equal(result.rule.created_by, author)
    // An omitted description is not sent as null.
    assert.deepEqual(updated[0]?.data, { is_enabled: false, updated_by: ADMIN_ID })
  })

  it('raises ERR_NOT_FOUND for an unknown rule', async () => {
    const { service, writes } = makeService()

    await assert.rejects(
      service.updateAllowlistRule(auth, { id: uuidv7(), is_enabled: true }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.NOT_FOUND)
        return true
      }
    )
    assert.deepEqual(writes, [])
  })
})

describe('AdminActivityUrlAllowlistService.previewAllowlistImpact', () => {
  const activities = [
    { id: uuidv7(), url: 'https://ximera.example/course/calculus/week-1' },
    { id: uuidv7(), url: 'https://ximera.example/course/algebra/week-1' },
    { id: uuidv7(), url: 'https://elsewhere.example/page' },
  ]

  it('counts the activities a prospective policy would not admit', async () => {
    const { service } = makeService({ activities })

    const preview = await service.previewAllowlistImpact(auth, {
      base_urls: ['https://ximera.example/course/calculus'],
    })

    assert.equal(preview.total_activities, 3)
    assert.equal(preview.grandfathered_count, 2)
    assert.deepEqual(
      preview.grandfathered_sample.map(({ url }) => url),
      ['https://ximera.example/course/algebra/week-1', 'https://elsewhere.example/page']
    )
  })

  it('counts every activity when the prospective policy is empty', async () => {
    const { service } = makeService({ activities })

    const preview = await service.previewAllowlistImpact(auth, { base_urls: [] })

    assert.equal(preview.grandfathered_count, 3)
  })

  it('previews the policy currently in force when no base urls are given', async () => {
    const { service } = makeService({
      activities,
      enabledPolicyRules: [{ origin: 'https://ximera.example', path_prefix: '/' }],
    })

    const preview = await service.previewAllowlistImpact(auth, {})

    assert.equal(preview.grandfathered_count, 1)
    assert.deepEqual(
      preview.grandfathered_sample.map(({ url }) => url),
      ['https://elsewhere.example/page']
    )
  })

  it('rejects a malformed prospective base url', async () => {
    const { service } = makeService({ activities })

    await assertValidationError(
      service.previewAllowlistImpact(auth, { base_urls: ['javascript:evil'] }),
      'javascript:evil'
    )
  })
})

describe('AdminActivityUrlAllowlistService activity isolation', () => {
  it('never mutates activities or associations on create, update or delete', async () => {
    // A characterization guard, not coverage of a defect: the service has no
    // dependency that could touch `activities` or `activity_activity_code`, and
    // the assertion is that it never gains one. A rule change is a policy
    // change and nothing else -- editing, disabling or deleting a rule must not
    // delete an activity, drop an association, or block a later deep link.
    const existing = ruleRecord({ origin: 'https://example.edu' })
    const { service, writes } = makeService({
      rules: [existing],
      activities: [{ id: uuidv7(), url: 'https://elsewhere.example/page' }],
    })

    await service.createAllowlistRule(auth, { base_url: 'https://new.example' })
    await service.updateAllowlistRule(auth, { id: existing.id, is_enabled: false })
    await service.deleteAllowlistRule(auth, { id: existing.id })

    // Every write went to the rules table and nowhere else.
    assert.deepEqual(writes, ['createRule', 'updateRule', 'deleteRule'])
  })

  it('lists rules with their derived base urls', async () => {
    const { service } = makeService({
      rules: [
        ruleRecord({ origin: 'https://example.edu', path_prefix: '/' }),
        ruleRecord({ origin: 'https://ximera.example', path_prefix: '/course/calculus' }),
      ],
    })

    const { rules } = await service.listAllowlistRules(auth)

    assert.deepEqual(
      rules.map(({ base_url }) => base_url),
      ['https://example.edu', 'https://ximera.example/course/calculus']
    )
  })
})

describe('AdminActivityUrlAllowlistCommands declarations', () => {
  // Not a test of the command framework, which is covered elsewhere. It guards
  // the one thing about these declarations that `typecheck` cannot catch: a
  // command that names no ability, or the wrong one, still compiles.
  const commands = new AdminActivityUrlAllowlistCommands({
    utils: new CoreUtils({ logger }),
    service: makeService().service,
  })

  const expected = {
    listAllowlistRules: ['activity-url-allowlist:list'],
    previewAllowlistImpact: ['activity-url-allowlist:list'],
    createAllowlistRule: ['activity-url-allowlist:manage'],
    updateAllowlistRule: ['activity-url-allowlist:manage'],
    deleteAllowlistRule: ['activity-url-allowlist:manage'],
  } as const

  for (const [name, abilities] of Object.entries(expected)) {
    it(`guards ${name} with ${abilities.join(', ')} in admin mode`, () => {
      const command = commands[name as keyof typeof expected]

      // Admin mode is what keeps an instructor or learner token out, even if
      // an ability string were ever duplicated across actor domains.
      assert.equal(command.auth.mode, 'admin')
      assert.deepEqual(command.auth.abilities, abilities)
    })
  }
})
