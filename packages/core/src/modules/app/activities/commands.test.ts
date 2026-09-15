import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import { ActivityCommands } from './commands.js'
import { INSTRUCTOR_ACTIVITY_URL_MESSAGES, URL_PREFIX_MESSAGES } from './schemas.js'
import { ActivityService } from './services/activity.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { ActivityRecord } from '@/modules/activity-registration/repository/index.js'
import type {
  ActivityRegistrationService,
  RegistrationOutcome,
} from '@/modules/activity-registration/services/activity-registration.js'
import type { ActivityCodeRecord, ActivityMutations, ActivityQueries } from './repository/index.js'
import type { StartActivityService } from './services/start-activity.js'

const ORIGIN = 'https://content.test'
/** Already registered, so a rejection below cannot be about a missing activity. */
const KNOWN_URL = `${ORIGIN}/lesson`
/** Refused by the fake registration, so a denial can be correlated. */
const DENIED_URL = `${ORIGIN}/denied`
/** Also registered: the identity a raw-space spelling would normalize to. */
const KNOWN_ENCODED_SPACE_URL = `${ORIGIN}/lesson%20one`

const activityRecord = (url: string): ActivityRecord => ({
  id: uuidv7(),
  url,
  name: null,
  created_at: new Date(),
  updated_at: new Date(),
})

const activityCodeRecord = (url_prefix: string | null = null): ActivityCodeRecord => ({
  id: uuidv7(),
  created_by: null,
  code: 'brave-otter',
  private_code: 'private',
  url_prefix,
  description: null,
  created_at: new Date(),
  updated_at: new Date(),
})

/**
 * The real command wrapper over a real `ActivityService`, whose collaborators
 * record every call. A validation failure must leave all of them untouched.
 */
const makeCommands = () => {
  const logLines: string[] = []
  const logger = createCoreLogger({
    pinoLogger: pino(
      { level: 'warn' },
      {
        write: (chunk: string) => {
          logLines.push(chunk)
        },
      }
    ),
  })

  const calls: string[] = []
  const stored: { url_prefix?: string | null } = {}
  const known = new Map(
    [KNOWN_URL, KNOWN_ENCODED_SPACE_URL].map((url) => [url, activityRecord(url)] as const)
  )

  const registration = {
    loadPolicy: async () => {
      calls.push('loadPolicy')
      return { rules: [] }
    },
    register: async (url: string): Promise<RegistrationOutcome> => {
      calls.push(`register ${url}`)
      if (url === DENIED_URL) {
        return { ok: false, url, reason: 'activity_url_not_allowed' }
      }
      const existing = known.get(normalizeActivityUrl(url) ?? '')
      assert.ok(existing, 'only known urls are registered in these tests')
      return { ok: true, activity: existing }
    },
  } as unknown as ActivityRegistrationService

  const service = new ActivityService({
    logger,
    tx: {
      withTransaction: async <T>(fn: () => Promise<T>) => {
        calls.push('withTransaction')
        return await fn()
      },
    } as TXManager,
    queries: {
      findActivityCodeById: async () => {
        calls.push('findActivityCodeById')
        return activityCodeRecord()
      },
      isMember: async () => {
        calls.push('isMember')
        return true
      },
    } as unknown as ActivityQueries,
    mutations: {
      createActivityCode: async ({ url_prefix }: { url_prefix: string | null }) => {
        calls.push('createActivityCode')
        stored.url_prefix = url_prefix
        return activityCodeRecord(url_prefix)
      },
      updateActivityCode: async (_id: string, { url_prefix }: { url_prefix: string | null }) => {
        calls.push('updateActivityCode')
        stored.url_prefix = url_prefix
        return activityCodeRecord(url_prefix)
      },
      addMember: async () => {
        calls.push('addMember')
      },
      removeActivitiesFromActivityCode: async () => {
        calls.push('removeActivitiesFromActivityCode')
      },
      assignActivitiesToActivityCode: async () => {
        calls.push('assignActivitiesToActivityCode')
      },
    } as unknown as ActivityMutations,
    activityRegistration: { service: registration },
  })

  // What the command wrapper hands each handler, captured before the commands
  // bind the service methods.
  const handlerInputs: { url_prefix?: string | null; urls: string[] }[] = []
  const createActivityCode = service.createActivityCode.bind(service)
  const updateActivityCode = service.updateActivityCode.bind(service)
  Object.assign(service, {
    createActivityCode: ((auth, request) => {
      handlerInputs.push(request)
      return createActivityCode(auth, request)
    }) satisfies typeof createActivityCode,
    updateActivityCode: ((auth, request) => {
      handlerInputs.push(request)
      return updateActivityCode(auth, request)
    }) satisfies typeof updateActivityCode,
  })

  const commands = new ActivityCommands({
    utils: new CoreUtils({ logger }),
    service,
    startService: {} as unknown as StartActivityService,
    launchViewService: {} as never,
  })

  const ctx = {
    requestId: 'request-1',
    userAuth: new UserAuth(uuidv7(), ['activity_codes:create_own', 'activity_codes:update_own']),
  }

  return { commands, ctx, calls, stored, handlerInputs, logLines }
}

type Issue = { path: (string | number)[]; message: string }

const validationIssues = (result: {
  ok: boolean
  error?: { code: string; details?: unknown }
}): Issue[] => {
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'ERR_VALIDATION')
  const details = result.error?.details as { issues: Issue[] } | undefined
  assert.ok(details, 'a validation error carries its issues')
  return details.issues
}

const operations = [
  {
    name: 'createActivityCode',
    run: (
      m: ReturnType<typeof makeCommands>,
      input: { url_prefix?: string | null; urls: string[] }
    ) => m.commands.createActivityCode(m.ctx, { code: 'brave-otter', ...input }),
  },
  {
    name: 'updateActivityCode',
    run: (
      m: ReturnType<typeof makeCommands>,
      input: { url_prefix?: string | null; urls: string[] }
    ) => m.commands.updateActivityCode(m.ctx, { id: uuidv7(), ...input }),
  },
] as const

for (const { name, run } of operations) {
  describe(`ActivityCommands.${name} validation`, () => {
    for (const suffix of ['?exercise=1', '#part-2', '?', '#']) {
      it(`rejects a known activity url with ${suffix} before the handler runs`, async () => {
        const m = makeCommands()

        const result = await run(m, { urls: [`${ORIGIN}/other`, `${KNOWN_URL}${suffix}`] })

        assert.deepEqual(
          validationIssues(result).map(({ path, message }) => ({ path, message })),
          [
            {
              path: ['urls', 1],
              message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.unsupported_url_components,
            },
          ]
        )
        assert.deepEqual(m.calls, [])
        assert.deepEqual(m.handlerInputs, [])
      })

      it(`rejects a prefix with ${suffix} before the handler runs`, async () => {
        const m = makeCommands()

        const result = await run(m, { url_prefix: `${ORIGIN}/${suffix}`, urls: [KNOWN_URL] })

        assert.deepEqual(
          validationIssues(result).map(({ path, message }) => ({ path, message })),
          [{ path: ['url_prefix'], message: URL_PREFIX_MESSAGES.unsupported_url_components }]
        )
        assert.deepEqual(m.calls, [])
        assert.deepEqual(m.handlerInputs, [])
      })
    }

    it('rejects a literal space in a url whose encoded spelling is known, before the handler runs', async () => {
      const m = makeCommands()

      const result = await run(m, {
        urls: [KNOWN_URL, `${ORIGIN}/lesson one`, `${ORIGIN}/lesson one?x=1`],
      })

      assert.deepEqual(
        validationIssues(result).map(({ path, message }) => ({ path, message })),
        [
          { path: ['urls', 1], message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.literal_space },
          { path: ['urls', 2], message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.literal_space },
        ]
      )
      assert.deepEqual(m.calls, [])
      assert.deepEqual(m.handlerInputs, [])
    })

    it('rejects a literal space in the prefix before the handler runs', async () => {
      const m = makeCommands()

      const result = await run(m, { url_prefix: `${ORIGIN}/course one/`, urls: [KNOWN_URL] })

      assert.deepEqual(
        validationIssues(result).map(({ path, message }) => ({ path, message })),
        [{ path: ['url_prefix'], message: URL_PREFIX_MESSAGES.literal_space }]
      )
      assert.deepEqual(m.calls, [])
      assert.deepEqual(m.handlerInputs, [])
    })

    it('accepts an encoded space in a url and the prefix', async () => {
      const m = makeCommands()

      const result = await run(m, {
        url_prefix: ` ${ORIGIN}/lesson%20 `,
        urls: [KNOWN_ENCODED_SPACE_URL],
      })

      assert.equal(result.ok, true)
      assert.deepEqual(m.handlerInputs[0]?.urls, [KNOWN_ENCODED_SPACE_URL])
      assert.ok(m.calls.includes(`register ${KNOWN_ENCODED_SPACE_URL}`))
      assert.equal(m.stored.url_prefix, `${ORIGIN}/lesson%20`)
    })

    it('registers the key of the trimmed spelling, keeping the submitted urls', async () => {
      // `trim()` strips a no-break space; the URL parser does not, and would
      // otherwise register `/lesson` as a different `/lesson%C2%A0` activity.
      const m = makeCommands()
      const urls = [`\u00a0${KNOWN_URL}\u00a0`, `${KNOWN_URL}\u00a0`, ` ${KNOWN_URL}\t`]

      const result = await run(m, { urls })

      assert.equal(result.ok, true)
      assert.deepEqual(m.handlerInputs[0]?.urls, urls)
      assert.deepEqual(
        m.calls.filter((call) => call.startsWith('register ')),
        [`register ${KNOWN_URL}`]
      )
    })

    it('names the submitted untrimmed spellings in a denial', async () => {
      const m = makeCommands()
      const urls = [KNOWN_URL, `\u00a0${DENIED_URL}\u00a0`, `${DENIED_URL}\u00a0`]

      const result = await run(m, { urls })

      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.error.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
      assert.deepEqual(result.ok === false && result.error.details, {
        rejected: [
          { url: `\u00a0${DENIED_URL}\u00a0`, reason: 'activity_url_not_allowed' },
          { url: `${DENIED_URL}\u00a0`, reason: 'activity_url_not_allowed' },
        ],
      })
      assert.ok(m.calls.includes(`register ${DENIED_URL}`))
      assert.ok(!m.calls.some((call) => call.includes('%C2%A0')))
    })

    it('rejects an oversized canonical prefix before the handler runs', async () => {
      const m = makeCommands()
      // 65 characters as typed, but percent-encoding each `é` as six
      // characters takes the canonical form to 261.
      const prefix = `https://content.test:443/${'é'.repeat(40)}`

      const result = await run(m, { url_prefix: prefix, urls: [KNOWN_URL] })

      assert.deepEqual(
        validationIssues(result).map(({ path, message }) => ({ path, message })),
        [{ path: ['url_prefix'], message: URL_PREFIX_MESSAGES.url_too_long }]
      )
      assert.deepEqual(m.calls, [])
      assert.deepEqual(m.handlerInputs, [])
    })

    it('hands the handler a canonical prefix and the submitted url spellings', async () => {
      const m = makeCommands()

      const result = await run(m, {
        url_prefix: 'HTTPS://CONTENT.TEST:443',
        urls: ['HTTPS://CONTENT.TEST:443/lesson'],
      })

      assert.equal(result.ok, true)
      assert.equal(m.handlerInputs.length, 1)
      assert.equal(m.handlerInputs[0]?.url_prefix, `${ORIGIN}/`)
      // The spelling reaches the handler intact, which is what lets a denial
      // name the typed line; only registration receives the canonical key.
      assert.deepEqual(m.handlerInputs[0]?.urls, ['HTTPS://CONTENT.TEST:443/lesson'])
      assert.ok(m.calls.includes(`register ${KNOWN_URL}`))
      assert.equal(m.stored.url_prefix, `${ORIGIN}/`)
    })

    it('stores no prefix for an empty or whitespace-only prefix', async () => {
      for (const url_prefix of ['', '   ']) {
        const m = makeCommands()

        const result = await run(m, { url_prefix, urls: [KNOWN_URL] })

        assert.equal(result.ok, true, JSON.stringify(url_prefix))
        assert.equal(m.stored.url_prefix, null, JSON.stringify(url_prefix))
      }
    })

    it('logs a literal-space warning without submitted url values', async () => {
      const m = makeCommands()

      await run(m, {
        url_prefix: `${ORIGIN}/course prefix-secret/`,
        urls: [`${ORIGIN}/lesson secret-path-value`],
      })

      const joined = m.logLines.join('\n')
      assert.match(joined, /ERR_VALIDATION/)
      assert.doesNotMatch(joined, /secret-path-value/)
      assert.doesNotMatch(joined, /prefix-secret/)
      assert.doesNotMatch(joined, /content\.test/)
      assert.doesNotMatch(joined, /administrator|request access/i)
    })

    it('logs the validation warning without submitted url values', async () => {
      const m = makeCommands()

      await run(m, {
        url_prefix: `${ORIGIN}/course?prefix-secret=1`,
        urls: [`${KNOWN_URL}?token=secret-token-value#secret-fragment`],
      })

      const joined = m.logLines.join('\n')
      assert.match(joined, /ERR_VALIDATION/)
      assert.doesNotMatch(joined, /secret-token-value/)
      assert.doesNotMatch(joined, /secret-fragment/)
      assert.doesNotMatch(joined, /prefix-secret/)
      assert.doesNotMatch(joined, /content\.test/)
    })
  })
}
