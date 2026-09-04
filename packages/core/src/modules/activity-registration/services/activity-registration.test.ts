import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { ErrorCodes } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { ActivityRegistrationService } from './activity-registration.js'
import type { CoreError } from '@/lib/errors.js'
import type {
  ActivityRecord,
  ActivityUrlAllowlistMutations,
  ActivityUrlAllowlistQueries,
} from '../repository/index.js'
import type { PolicySnapshot } from '../schemas.js'
import type { AllowlistPolicyService } from './allowlist-policy.js'

const activityRecord = (url: string): ActivityRecord => ({
  id: uuidv7(),
  url,
  name: null,
  created_at: new Date(),
  updated_at: new Date(),
})

const snapshot = (...origins: string[]): PolicySnapshot => ({
  rules: origins.map((origin) => ({ origin, path_prefix: '/' })),
})

/**
 * Builds the service over fakes that count their calls.
 *
 * The counts are load-bearing rather than incidental: grandfathering and the
 * no-insert-on-denial rule are both statements about a call that must *not*
 * happen, and a returned value cannot express either.
 */
const makeService = ({
  known = [],
  insertWins = true,
  winnerAfterConflict = true,
  logLines,
}: {
  /** URLs that already have an `activities` row. */
  known?: string[]
  /** False simulates a concurrent insert winning the race. */
  insertWins?: boolean
  /** False simulates the row vanishing between the insert and the re-read. */
  winnerAfterConflict?: boolean
  /** When given, warn-level log output is captured into it as raw JSON lines. */
  logLines?: string[]
} = {}) => {
  const rows = new Map(known.map((url) => [url, activityRecord(url)]))
  let evaluations = 0
  let inserts = 0
  let reads = 0

  const logger = createCoreLogger({
    pinoLogger:
      logLines === undefined
        ? pino({ level: 'silent' })
        : pino(
            { level: 'warn' },
            {
              write: (chunk: string) => {
                logLines.push(chunk)
              },
            }
          ),
  })

  const policy = {
    loadPolicy: async () => snapshot('https://content.example'),
    evaluate: (url: string, policySnapshot: PolicySnapshot) => {
      evaluations += 1
      let candidate: URL
      try {
        candidate = new URL(url)
      } catch {
        return { ok: false as const, reason: 'malformed_url' as const }
      }
      if (candidate.protocol !== 'https:') {
        return { ok: false as const, reason: 'malformed_url' as const }
      }
      return policySnapshot.rules.some(({ origin }) => origin === candidate.origin)
        ? { ok: true as const, url: candidate }
        : { ok: false as const, reason: 'activity_url_not_allowed' as const }
    },
  } as unknown as AllowlistPolicyService

  const service = new ActivityRegistrationService({
    logger,
    queries: {
      findActivityByUrl: async (url: string) => {
        reads += 1
        return rows.get(url)
      },
    } as unknown as ActivityUrlAllowlistQueries,
    mutations: {
      insertActivity: async (url: string) => {
        inserts += 1
        if (!insertWins) {
          // A concurrent registration won; the caller must re-read.
          if (winnerAfterConflict) {
            rows.set(url, activityRecord(url))
          }
          return undefined
        }
        const created = activityRecord(url)
        rows.set(url, created)
        return created
      },
    } as unknown as ActivityUrlAllowlistMutations,
    policy,
  })

  return {
    service,
    counts: () => ({ evaluations, inserts, reads }),
  }
}

describe('ActivityRegistrationService.register', () => {
  it('returns a known activity without consulting the policy at all', async () => {
    // Grandfathering. Asserting the *absence* of the evaluation is the only way
    // to prove it: a rule that no longer matches this URL, or no rules at all,
    // must not change the answer for content Modulus has already accepted.
    const url = 'https://long-forgotten.example/course/calculus'
    const { service, counts } = makeService({ known: [url] })

    const outcome = await service.register(url, { rules: [] })

    assert.equal(outcome.ok, true)
    assert.equal(outcome.ok && outcome.activity.url, url)
    assert.equal(counts().evaluations, 0)
    assert.equal(counts().inserts, 0)
  })

  it('inserts an unseen allowed url once and returns the new row', async () => {
    const url = 'https://content.example/course/calculus'
    const { service, counts } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.equal(outcome.ok, true)
    assert.equal(outcome.ok && outcome.activity.url, url)
    assert.equal(counts().inserts, 1)
  })

  it('denies an unseen disallowed url and inserts nothing', async () => {
    const url = 'https://elsewhere.example/course/calculus'
    const { service, counts } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.deepEqual(outcome, { ok: false, url, reason: 'activity_url_not_allowed' })
    assert.equal(counts().inserts, 0)
  })

  it('denies an unseen url when the snapshot is empty', async () => {
    // Deny-by-default, reached through the service rather than the policy.
    const url = 'https://content.example/course/calculus'
    const { service, counts } = makeService()

    const outcome = await service.register(url, { rules: [] })

    assert.deepEqual(outcome, { ok: false, url, reason: 'activity_url_not_allowed' })
    assert.equal(counts().inserts, 0)
  })

  it('reports url_too_long before evaluating the policy or inserting', async () => {
    // The bound belongs to the `activities.url` column, so it is the writer's
    // check. Today an over-long URL surfaces as a database error instead.
    const url = `https://content.example/${'a'.repeat(256)}`
    assert.ok(url.length > 255)
    const { service, counts } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.deepEqual(outcome, { ok: false, url, reason: 'url_too_long' })
    assert.equal(counts().evaluations, 0)
    assert.equal(counts().inserts, 0)
  })

  it('accepts a url of exactly the column width', async () => {
    const url = `https://content.example/${'a'.repeat(255 - 'https://content.example/'.length)}`
    assert.equal(url.length, 255)
    const { service } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.equal(outcome.ok, true)
  })

  it('reports malformed_url for a javascript: url and inserts nothing', async () => {
    const url = 'javascript:alert(1)'
    const { service, counts } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.deepEqual(outcome, { ok: false, url, reason: 'malformed_url' })
    assert.equal(counts().inserts, 0)
  })

  it('resolves the winning row when a concurrent insert wins the race', async () => {
    const url = 'https://content.example/course/calculus'
    const { service, counts } = makeService({ insertWins: false })

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.equal(outcome.ok, true)
    assert.equal(outcome.ok && outcome.activity.url, url)
    // Resolved, insert conflicted, re-read.
    assert.equal(counts().reads, 2)
  })

  it('raises ERR_UNHANDLED when the row neither inserts nor resolves', async () => {
    const { service } = makeService({ insertWins: false, winnerAfterConflict: false })

    await assert.rejects(
      service.register('https://content.example/x', snapshot('https://content.example')),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.UNHANDLED)
        return true
      }
    )
  })
})

describe('ActivityRegistrationService denial diagnostics', () => {
  it('logs the origin and path of a denied url, and no learner identity', async () => {
    // The denial log is the one place a refusal is recorded, and a refusal is
    // not a reason to log a learner. No user id, LMS context, token, auth code
    // or PKCE value may reach this line.
    const logLines: string[] = []
    const { service } = makeService({ logLines })

    const outcome = await service.register(
      'https://elsewhere.example/course/calculus?token=secret-token-value#frag',
      snapshot('https://content.example')
    )

    assert.equal(outcome.ok, false)
    assert.equal(logLines.length, 1)

    const line = logLines[0] ?? ''
    assert.match(line, /https:\/\/elsewhere\.example/)
    assert.match(line, /\/course\/calculus/)
    assert.match(line, /activity_url_not_allowed/)

    // The query string carried a token-shaped value; it must not have been
    // logged along with the origin and path.
    assert.doesNotMatch(line, /secret-token-value/)
  })

  it('logs a malformed url denial without an origin or path', async () => {
    const logLines: string[] = []
    const { service } = makeService({ logLines })

    await service.register('javascript:alert(1)', snapshot('https://content.example'))

    assert.equal(logLines.length, 1)
    const line = logLines[0] ?? ''
    assert.match(line, /malformed_url/)
    assert.doesNotMatch(line, /alert/)
  })

  it('logs nothing when a url is admitted', async () => {
    const logLines: string[] = []
    const { service } = makeService({ logLines })

    await service.register('https://content.example/x', snapshot('https://content.example'))

    assert.deepEqual(logLines, [])
  })
})
