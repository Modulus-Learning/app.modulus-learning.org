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
  // The exact key each collaborator received, in call order. Asserting these,
  // rather than only the outcome, is what shows that lookup, policy, insert and
  // re-read all agree on the canonical key rather than the submitted spelling.
  const lookups: string[] = []
  const evaluated: string[] = []
  const insertedKeys: string[] = []

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
      evaluated.push(url)
      let candidate: URL
      try {
        candidate = new URL(url)
      } catch {
        return { ok: false as const, reason: 'malformed_url' as const }
      }
      if (candidate.protocol !== 'https:') {
        return { ok: false as const, reason: 'malformed_url' as const }
      }
      return policySnapshot.rules.length === 0 ||
        policySnapshot.rules.some(({ origin }) => origin === candidate.origin)
        ? { ok: true as const, url: candidate }
        : { ok: false as const, reason: 'activity_url_not_allowed' as const }
    },
  } as unknown as AllowlistPolicyService

  const service = new ActivityRegistrationService({
    logger,
    queries: {
      findActivityByUrl: async (url: string) => {
        lookups.push(url)
        return rows.get(url)
      },
    } as unknown as ActivityUrlAllowlistQueries,
    mutations: {
      insertActivity: async (url: string) => {
        insertedKeys.push(url)
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
    counts: () => ({
      evaluations: evaluated.length,
      inserts: insertedKeys.length,
      reads: lookups.length,
    }),
    keys: () => ({ lookups, evaluated, inserted: insertedKeys }),
  }
}

describe('ActivityRegistrationService.register', () => {
  it('does not invoke a lazy policy loader for a known activity', async () => {
    const url = 'https://grandfathered.example/course'
    const { service } = makeService({ known: [url] })
    const outcome = await service.register(url, async () => {
      assert.fail('known activities must not load policy')
    })
    assert.equal(outcome.ok, true)
  })

  it('uses a lazy policy loader to decide an unseen activity', async () => {
    const { service } = makeService()
    let loads = 0
    const url = 'https://elsewhere.example/course'
    const outcome = await service.register(url, async () => {
      loads += 1
      return snapshot('https://content.example')
    })
    assert.equal(loads, 1)
    assert.deepEqual(outcome, { ok: false, url, reason: 'activity_url_not_allowed' })
  })

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

  it('admits an unseen url when the snapshot is empty', async () => {
    const url = 'https://content.example/course/calculus'
    const { service, counts } = makeService()

    const outcome = await service.register(url, { rules: [] })

    assert.equal(outcome.ok, true)
    assert.equal(counts().inserts, 1)
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

describe('ActivityRegistrationService canonical keys', () => {
  const CANONICAL = 'https://content.example/course/calculus'
  const VARIANT = 'HTTPS://Content.Example:443/course/./calculus?week=3#top'

  it('looks up, evaluates, inserts and re-reads the canonical key', async () => {
    const { service, keys } = makeService({ insertWins: false })

    const outcome = await service.register(VARIANT, snapshot('https://content.example'))

    assert.equal(outcome.ok, true)
    assert.equal(outcome.ok && outcome.activity.url, CANONICAL)
    assert.deepEqual(keys(), {
      lookups: [CANONICAL, CANONICAL],
      evaluated: [CANONICAL],
      inserted: [CANONICAL],
    })
  })

  it('stores the canonical key when the insert wins', async () => {
    const { service, keys } = makeService()

    const outcome = await service.register(VARIANT, { rules: [] })

    assert.equal(outcome.ok && outcome.activity.url, CANONICAL)
    assert.deepEqual(keys().inserted, [CANONICAL])
  })

  it('resolves an equivalent spelling of a known activity without loading policy', async () => {
    const { service, counts, keys } = makeService({ known: [CANONICAL] })

    const outcome = await service.register(VARIANT, async () => {
      assert.fail('known activities must not load policy')
    })

    assert.equal(outcome.ok && outcome.activity.url, CANONICAL)
    assert.deepEqual(keys().lookups, [CANONICAL])
    assert.equal(counts().evaluations, 0)
    assert.equal(counts().inserts, 0)
  })

  it('does not treat a known row as a match for a distinct canonical path', async () => {
    // The fake only resolves the keys it holds, so a trailing slash is looked
    // up as its own activity and faces the policy.
    const { service, keys } = makeService({ known: [CANONICAL] })

    const outcome = await service.register(`${CANONICAL}/`, snapshot('https://elsewhere.example'))

    assert.deepEqual(outcome, {
      ok: false,
      url: `${CANONICAL}/`,
      reason: 'activity_url_not_allowed',
    })
    assert.deepEqual(keys().evaluated, [`${CANONICAL}/`])
  })

  it('reports malformed_url for an unparseable url before any lookup or policy read', async () => {
    const url = 'not a url'
    const { service, keys } = makeService()

    const outcome = await service.register(url, async () => {
      assert.fail('an unparseable url must not load policy')
    })

    assert.deepEqual(outcome, { ok: false, url, reason: 'malformed_url' })
    assert.deepEqual(keys(), { lookups: [], evaluated: [], inserted: [] })
  })

  it('evaluates the canonical key and returns the submitted url on a policy denial', async () => {
    const url = 'https://ELSEWHERE.example:443/course?week=3#top'
    const { service, keys } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.deepEqual(outcome, { ok: false, url, reason: 'activity_url_not_allowed' })
    assert.deepEqual(keys(), {
      lookups: ['https://elsewhere.example/course'],
      evaluated: ['https://elsewhere.example/course'],
      inserted: [],
    })
  })

  it('propagates a failed policy read and inserts nothing', async () => {
    const { service, counts } = makeService()
    const failure = new Error('policy read failed')

    await assert.rejects(
      service.register(VARIANT, async () => {
        throw failure
      }),
      (error) => error === failure
    )
    assert.equal(counts().evaluations, 0)
    assert.equal(counts().inserts, 0)
  })

  it('accepts a canonical key of exactly 255 characters and denies 256', async () => {
    const base = 'HTTPS://CONTENT.EXAMPLE:443/'
    const canonicalBase = 'https://content.example/'
    const fits = `${base}${'a'.repeat(255 - canonicalBase.length)}`
    const overflows = `${base}${'a'.repeat(256 - canonicalBase.length)}`
    const { service, keys } = makeService()

    const accepted = await service.register(fits, snapshot('https://content.example'))
    assert.equal(accepted.ok && accepted.activity.url.length, 255)

    const denied = await service.register(overflows, snapshot('https://content.example'))
    assert.deepEqual(denied, { ok: false, url: overflows, reason: 'url_too_long' })
    // The oversized key was looked up but never evaluated or stored.
    assert.equal(keys().evaluated.length, 1)
    assert.equal(keys().inserted.length, 1)
  })

  it('admits a long submitted url whose canonical key fits the column', async () => {
    const url = `HTTPS://CONTENT.EXAMPLE:443/drop/../${'a'.repeat(231)}`
    assert.ok(url.length > 255)
    const { service, keys } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.equal(outcome.ok, true)
    assert.deepEqual(keys().inserted, [`https://content.example/${'a'.repeat(231)}`])
    assert.equal(keys().inserted[0]?.length, 255)
  })

  it('does not count a query or fragment towards the storage bound', async () => {
    const url = `${CANONICAL}?state=${'q'.repeat(300)}#${'f'.repeat(300)}`
    const { service, keys } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.equal(outcome.ok && outcome.activity.url, CANONICAL)
    assert.deepEqual(keys().inserted, [CANONICAL])
  })

  it('reports url_too_long when Unicode encoding expands the key past the bound', async () => {
    // Each é is one character submitted and six (%C3%A9) once serialized.
    const url = `https://content.example/${'é'.repeat(40)}`
    assert.ok(url.length <= 255)
    const { service, counts } = makeService()

    const outcome = await service.register(url, snapshot('https://content.example'))

    assert.deepEqual(outcome, { ok: false, url, reason: 'url_too_long' })
    assert.equal(counts().evaluations, 0)
    assert.equal(counts().inserts, 0)
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

  it('logs an unparseable url denial with its reason only', async () => {
    const logLines: string[] = []
    const { service } = makeService({ logLines })

    await service.register('not a url secret-value', snapshot('https://content.example'))

    assert.equal(logLines.length, 1)
    const line = logLines[0] ?? ''
    assert.match(line, /malformed_url/)
    assert.doesNotMatch(line, /secret-value/)
  })

  it('logs the unhandled registration failure without the submitted url', async () => {
    const logLines: string[] = []
    const { service } = makeService({
      logLines,
      insertWins: false,
      winnerAfterConflict: false,
    })

    await assert.rejects(
      service.register(
        'https://user:pass@content.example/private-path?token=secret-token-value#frag',
        { rules: [] }
      ),
      (error: CoreError) => {
        assert.equal(error.details, undefined)
        return true
      }
    )

    assert.equal(logLines.length, 1)
    const line = logLines[0] ?? ''
    assert.match(line, /ERR_UNHANDLED|neither inserted nor resolved/)
    assert.doesNotMatch(line, /content\.example|private-path|secret-token-value|user:pass/)
  })

  it('logs nothing when a url is admitted', async () => {
    const logLines: string[] = []
    const { service } = makeService({ logLines })

    await service.register('https://content.example/x', snapshot('https://content.example'))

    assert.deepEqual(logLines, [])
  })
})
