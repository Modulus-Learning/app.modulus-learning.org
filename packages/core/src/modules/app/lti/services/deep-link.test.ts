import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import { parseAdmissibleUrl } from '@/modules/activity-registration/url-policy.js'
import { INSTRUCTOR_ACTIVITY_URL_MESSAGES } from '@/modules/app/activities/schemas.js'
import { CLAIM_DEEP_LINKING_CONTENT, CLAIM_DEPLOYMENT_ID } from '../constants.js'
import { LtiDeepLinkingService } from './deep-link.js'
import type { UrlBuilder } from '@/config.js'
import type { CoreError } from '@/lib/errors.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { ActivityRecord } from '@/modules/activity-registration/repository/index.js'
import type { PolicySnapshot } from '@/modules/activity-registration/schemas.js'
import type {
  ActivityRegistrationService,
  RegistrationOutcome,
} from '@/modules/activity-registration/services/activity-registration.js'
import type {
  ActivityMutations,
  ActivityQueries,
} from '@/modules/app/activities/repository/index.js'
import type { LtiQueries } from '../repository/index.js'
import type { DeepLinkingContentItem } from '../types/messages/tool-originating/deep-linking-response.js'

const LTI_LAUNCH_URL = 'https://modulus.test/routes/lti/launch'
const ACTIVITY_URL = 'https://content.test/activity'
const ACTIVITY_CODE = 'course-code'
const PRIVATE_CODE = 'private-course-code'
const DEPLOYMENT_ID = 'deployment-17'

/**
 * @param urlPrefix       the activity code's own `url_prefix`, checked ahead of
 *                        the sitewide policy and independent of it.
 * @param known           canonical URLs that already have an activity row. A
 *                        known URL is admitted with no policy evaluation --
 *                        grandfathering.
 * @param allowedOrigins  origins of the enabled rules. As in production, zero
 *                        enabled rules admit every unseen URL; denial needs at
 *                        least one enabled rule that does not match.
 * @param activityCode    the resolved code's public `code`.
 * @param launchOwner     who initiated the pending launch: the caller, or
 *                        another user.
 * @param launchExpired   whether the pending launch has already expired.
 * @param member          whether the caller belongs to the activity code.
 * @param logLines        when given, warn-level log output is captured into it
 *                        as raw JSON lines.
 */
const createService = ({
  urlPrefix = null,
  known = [ACTIVITY_URL],
  allowedOrigins = [],
  activityCode = ACTIVITY_CODE,
  logLines,
  launchOwner = 'caller',
  launchExpired = false,
  member = true,
}: {
  urlPrefix?: string | null
  known?: string[]
  allowedOrigins?: string[]
  activityCode?: string
  logLines?: string[]
  launchOwner?: 'caller' | 'other'
  launchExpired?: boolean
  member?: boolean
} = {}) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  /** The payload handed to the key store, so the signed response can be read. */
  const signed: Record<string, unknown>[] = []
  const rows = new Map<string, ActivityRecord>(
    known.map((url) => [url, { id: uuidv7(), url } as ActivityRecord])
  )
  /** The submitted strings registration received, in call order. */
  const registered: string[] = []
  /** Canonical keys inserted as new activities. */
  const created: string[] = []
  /** Canonical URLs of the activities associated with the code. */
  const assigned: string[] = []
  let policyLoads = 0

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

  const registration = {
    loadPolicy: async (): Promise<PolicySnapshot> => {
      policyLoads++
      return { rules: allowedOrigins.map((origin) => ({ origin, path_prefix: '/' })) }
    },
    // Mirrors the real registration order: canonical key first, known rows
    // returned with no policy consulted, then the admission checks for an
    // unseen key. Rows are keyed canonically, so a fake that looked up the
    // submitted spelling would miss them.
    register: async (url: string, policy: PolicySnapshot): Promise<RegistrationOutcome> => {
      registered.push(url)
      const key = normalizeActivityUrl(url)
      if (key === null) {
        return { ok: false, url, reason: 'malformed_url' }
      }

      const existing = rows.get(key)
      if (existing !== undefined) {
        return { ok: true, activity: existing }
      }

      if (key.length > 255) {
        return { ok: false, url, reason: 'url_too_long' }
      }

      // The real parser, so the fake cannot disagree with production about
      // what `malformed_url` means.
      const candidate = parseAdmissibleUrl(key)
      if (candidate === null) {
        return { ok: false, url, reason: 'malformed_url' }
      }
      if (
        policy.rules.length > 0 &&
        !policy.rules.some((rule) => rule.origin === candidate.origin)
      ) {
        return { ok: false, url, reason: 'activity_url_not_allowed' }
      }

      const activity = { id: uuidv7(), url: key } as ActivityRecord
      rows.set(key, activity)
      created.push(key)
      return { ok: true, activity }
    },
  } as unknown as ActivityRegistrationService

  const service = new LtiDeepLinkingService({
    logger,
    urlBuilder: {
      baseUrl: 'https://modulus.test',
      // There is no per-activity URL builder to reach for any more, so a
      // return to an activity-specific content-item URL is a typecheck
      // failure rather than something these assertions have to catch.
      ltiLaunchUrl: LTI_LAUNCH_URL,
      dashboardUrl: 'https://modulus.test/dashboard',
    } satisfies UrlBuilder,
    queries: {
      findPendingDeepLink: async () => ({
        id: 'launch-1',
        user_id: launchOwner === 'caller' ? userId : uuidv7(),
        issuer: 'https://canvas.test',
        deployment_id: DEPLOYMENT_ID,
        deep_linking_data: 'opaque-platform-data',
        return_url: 'https://canvas.test/deep_link_return',
        context: 'assignment',
        expires_at: new Date(Date.now() + (launchExpired ? -60_000 : 60_000)),
      }),
      findPlatformByIssuer: async () => ({
        id: uuidv7(),
        issuer: 'https://canvas.test',
        client_id: 'client-1',
      }),
    } as unknown as LtiQueries,
    activities: {
      queries: {
        findActivityCodeById: async () => ({
          id: activityCodeId,
          code: activityCode,
          private_code: PRIVATE_CODE,
          url_prefix: urlPrefix,
        }),
        isMember: async () => member,
        findActivityByURL: async () => {
          throw new Error('findActivityByURL must not be used: registration resolves the row')
        },
      } as unknown as ActivityQueries,
      mutations: {
        assignActivitiesToActivityCode: async (_code: unknown, activities: ActivityRecord[]) => {
          assigned.push(...activities.map(({ url }) => url))
        },
      } as unknown as ActivityMutations,
    },
    ltiKeyStore: {
      signPlatformMessage: async (payload: Record<string, unknown>) => {
        signed.push(payload)
        return 'signed-jwt'
      },
    } as unknown as LtiKeyStore,
    activityRegistration: { service: registration },
  })

  return {
    service,
    userId,
    activityCodeId,
    rows,
    signed,
    registered,
    created,
    assigned,
    policyLoads: () => policyLoads,
  }
}

/** Runs a deep link expected to succeed, and returns the signed content item. */
const handle = async (
  activityUrl: string = ACTIVITY_URL,
  options: Parameters<typeof createService>[0] = {}
) => {
  const fixture = createService(options)
  const { service, userId, activityCodeId, signed } = fixture

  const result = await service.handleDeepLink(new UserAuth(userId, []), {
    launch_id: 'launch-1',
    activity_code_id: activityCodeId,
    activity_url: activityUrl,
  })

  const payload = signed[0]
  assert.ok(payload != null, 'expected the response to have been signed')
  const items = payload[CLAIM_DEEP_LINKING_CONTENT] as DeepLinkingContentItem[]
  const [item] = items
  assert.ok(item != null, 'expected one content item')
  // `url` is optional on the content-item type; every assertion below is about
  // what it holds, so an absent one is a failure rather than a skipped check.
  assert.ok(typeof item.url === 'string', 'expected the content item to carry a url')
  const url = item.url
  const custom = item.custom as Record<string, string>

  return { ...fixture, result, payload, items, item, url, custom }
}

/** Runs a deep link expected to fail, and reports what was attempted. */
const handleExpectingFailure = async (
  activityUrl: string,
  options: Parameters<typeof createService>[0] = {}
) => {
  const fixture = createService(options)
  const { service, userId, activityCodeId } = fixture

  const error = await service
    .handleDeepLink(new UserAuth(userId, []), {
      launch_id: 'launch-1',
      activity_code_id: activityCodeId,
      activity_url: activityUrl,
    })
    .then(
      () => undefined,
      (thrown: CoreError) => thrown
    )

  return { ...fixture, error }
}

/** Asserts that a refused deep link had no registration, association or signing effect. */
const assertNoEffects = (attempt: Awaited<ReturnType<typeof handleExpectingFailure>>) => {
  assert.equal(attempt.policyLoads(), 0)
  assert.deepEqual(attempt.registered, [])
  assert.deepEqual(attempt.created, [])
  assert.deepEqual(attempt.assigned, [])
  assert.deepEqual(attempt.signed, [])
}

describe('LtiDeepLinkingService.handleDeepLink', () => {
  it('returns a content item pointing at the generic tool launch url', async () => {
    const { url } = await handle()

    assert.equal(url, LTI_LAUNCH_URL)
  })

  it('embeds no activity identity in the content item url', async () => {
    // The launch reads the resource identity from the custom claims, so the
    // URL carries none of it. This is what lets the launch route decide the
    // destination per request rather than at deep-link time.
    const { url } = await handle()

    assert.ok(!url.includes(ACTIVITY_URL))
    assert.ok(!url.includes(encodeURIComponent(ACTIVITY_URL)))
    assert.ok(!url.includes(ACTIVITY_CODE))
  })

  it('names the window target by the public code and resolved activity id', async () => {
    const { item, rows } = await handle()
    const activity = rows.get(ACTIVITY_URL)
    assert.ok(activity != null)

    assert.deepEqual(item.window, { targetName: `modulus-${ACTIVITY_CODE}-${activity.id}` })
  })

  it('carries the resource identity in the custom claims', async () => {
    const { custom } = await handle()

    assert.equal(custom.modulus_launch_type, 'start-activity')
    assert.equal(custom.modulus_activity_code, ACTIVITY_CODE)
    assert.equal(custom.modulus_activity_url, ACTIVITY_URL)

    // The Canvas substitution variables the launch depends on ride along too.
    assert.equal(custom['Canvas.term.id'], '$Canvas.term.id')
    assert.equal(custom['Canvas.assignment.lockAt.iso8601'], '$Canvas.assignment.lockAt.iso8601')
  })

  it('signs a response naming the pending launch deployment id', async () => {
    const { result, payload, items } = await handle()

    assert.equal(payload[CLAIM_DEPLOYMENT_ID], DEPLOYMENT_ID)
    assert.equal(items.length, 1)
    assert.equal(result.jwt, 'signed-jwt')
    assert.equal(result.return_url, 'https://canvas.test/deep_link_return')
  })
})

describe('LtiDeepLinkingService launch ownership, expiry and membership', () => {
  // Each case submits an unseen URL the policy admits and the prefix accepts,
  // so reaching registration would create, associate and sign. Zero effects
  // therefore show that the refusal happened before any of them.
  const UNSEEN_URL = 'https://content.test/course/newly-typed'
  const admissible = {
    known: [],
    allowedOrigins: ['https://content.test'],
    urlPrefix: 'https://content.test/course/',
  }

  it('refuses a pending launch initiated by another user', async () => {
    const attempt = await handleExpectingFailure(UNSEEN_URL, {
      ...admissible,
      launchOwner: 'other',
    })

    assert.equal(attempt.error?.code, 'ERR_FORBIDDEN')
    assert.equal(attempt.error?.message, 'deep-link launch belongs to a different user')
    assertNoEffects(attempt)
  })

  it('refuses an expired pending launch', async () => {
    const attempt = await handleExpectingFailure(UNSEEN_URL, {
      ...admissible,
      launchExpired: true,
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINKING')
    assert.equal(attempt.error?.message, 'deep-link launch has expired')
    assertNoEffects(attempt)
  })

  it('refuses a caller who is not a member of the activity code', async () => {
    const attempt = await handleExpectingFailure(UNSEEN_URL, {
      ...admissible,
      member: false,
    })

    assert.equal(attempt.error?.code, 'ERR_FORBIDDEN')
    assert.equal(attempt.error?.message, 'not a member of this activity code')
    assertNoEffects(attempt)
  })

  it('links the same request once ownership, expiry and membership all hold', async () => {
    // The control for the three refusals above: without it, a fixture that
    // failed for some other reason would pass them too.
    const { result, created, assigned, signed } = await handle(UNSEEN_URL, admissible)

    assert.equal(result.jwt, 'signed-jwt')
    assert.deepEqual(created, [UNSEEN_URL])
    assert.deepEqual(assigned, [UNSEEN_URL])
    assert.equal(signed.length, 1)
  })
})

describe('LtiDeepLinkingService canonical content item', () => {
  // Each resolves to `ACTIVITY_URL` under the WHATWG serialization.
  const EQUIVALENT_SPELLINGS = [
    ACTIVITY_URL,
    'HTTPS://CONTENT.TEST/activity',
    'https://content.test:443/activity',
    'https://content.test/lessons/../activity',
    'https://content.test/./activity',
  ]

  it('signs the same custom url and target name for every equivalent spelling', async () => {
    // One fixture, so every spelling resolves against the same known row.
    const fixture = createService()
    const items: DeepLinkingContentItem[] = []

    for (const spelling of EQUIVALENT_SPELLINGS) {
      await fixture.service.handleDeepLink(new UserAuth(fixture.userId, []), {
        launch_id: 'launch-1',
        activity_code_id: fixture.activityCodeId,
        activity_url: spelling,
      })
    }
    for (const payload of fixture.signed) {
      const [item] = payload[CLAIM_DEEP_LINKING_CONTENT] as DeepLinkingContentItem[]
      assert.ok(item != null)
      items.push(item)
    }

    const activity = fixture.rows.get(ACTIVITY_URL)
    assert.ok(activity != null)
    assert.equal(items.length, EQUIVALENT_SPELLINGS.length)
    for (const item of items) {
      assert.equal((item.custom as Record<string, string>).modulus_activity_url, ACTIVITY_URL)
      assert.deepEqual(item.window, { targetName: `modulus-${ACTIVITY_CODE}-${activity.id}` })
    }
    assert.deepEqual(fixture.created, [])
  })

  it('signs the canonical url of an unseen activity registered from a variant spelling', async () => {
    const { custom, item, created, assigned, rows } = await handle(
      'HTTPS://Content.Test:443/lessons/./new-page',
      { known: [], allowedOrigins: ['https://content.test'] }
    )
    const canonical = 'https://content.test/lessons/new-page'
    const activity = rows.get(canonical)
    assert.ok(activity != null)

    assert.deepEqual(created, [canonical])
    assert.deepEqual(assigned, [canonical])
    assert.equal(custom.modulus_activity_url, canonical)
    assert.deepEqual(item.window, { targetName: `modulus-${ACTIVITY_CODE}-${activity.id}` })
  })

  it('preserves distinctions the canonical form keeps, such as path case and trailing slashes', async () => {
    const known = [
      'https://content.test/Lesson',
      'https://content.test/lesson',
      'https://content.test/lesson/',
    ]

    for (const url of known) {
      const { custom, rows, item } = await handle(url, { known })
      assert.equal(custom.modulus_activity_url, url)
      assert.deepEqual(item.window, {
        targetName: `modulus-${ACTIVITY_CODE}-${rows.get(url)?.id}`,
      })
    }
  })

  it('gives a different activity a different target name', async () => {
    const other = 'https://content.test/other-activity'
    const fixture = createService({ known: [ACTIVITY_URL, other] })
    for (const activity_url of [ACTIVITY_URL, other]) {
      await fixture.service.handleDeepLink(new UserAuth(fixture.userId, []), {
        launch_id: 'launch-1',
        activity_code_id: fixture.activityCodeId,
        activity_url,
      })
    }
    const targets = fixture.signed.map(
      (payload) =>
        (payload[CLAIM_DEEP_LINKING_CONTENT] as DeepLinkingContentItem[])[0]?.window?.targetName
    )

    assert.equal(targets.length, 2)
    assert.notEqual(targets[0], targets[1])
    assert.equal(targets[1], `modulus-${ACTIVITY_CODE}-${fixture.rows.get(other)?.id}`)
  })

  it('gives the same activity under another code a different target name', async () => {
    const first = await handle(ACTIVITY_URL, { activityCode: 'first-code' })
    const second = await handle(ACTIVITY_URL, { activityCode: 'second-code' })

    // Separate fixtures seed separate rows, so pin the activity id to compare
    // the code segment alone.
    const firstId = first.rows.get(ACTIVITY_URL)?.id
    const secondId = second.rows.get(ACTIVITY_URL)?.id
    assert.deepEqual(first.item.window, { targetName: `modulus-first-code-${firstId}` })
    assert.deepEqual(second.item.window, { targetName: `modulus-second-code-${secondId}` })
    assert.notEqual(first.item.window?.targetName, second.item.window?.targetName)
  })

  it('names neither the submitted url, the private code nor the code row id in the target', async () => {
    const { item, activityCodeId } = await handle('HTTPS://CONTENT.TEST:443/activity')
    const targetName = item.window?.targetName ?? ''

    assert.ok(!targetName.includes('content.test'))
    assert.ok(!targetName.includes(PRIVATE_CODE))
    assert.ok(!targetName.includes(activityCodeId))
  })
})

describe('LtiDeepLinkingService activity url allowlist', () => {
  const UNSEEN_URL = 'https://content.test/newly-typed'
  /** An enabled rule that matches none of the URLs below. */
  const NONMATCHING_RULE = ['https://somewhere-else.test']

  it('registers an unseen url when no rule is enabled', async () => {
    // The confirmed zero-rule contract: an empty policy allows every new
    // activity that passes admission syntax and the storage bound.
    const { result, created, assigned } = await handle(UNSEEN_URL, {
      known: [],
      allowedOrigins: [],
    })

    assert.deepEqual(created, [UNSEEN_URL])
    assert.deepEqual(assigned, [UNSEEN_URL])
    assert.equal(result.jwt, 'signed-jwt')
  })

  it('registers an unseen allowed url, associates it and returns a content item', async () => {
    const { result, signed, created, assigned } = await handle(UNSEEN_URL, {
      known: [],
      allowedOrigins: ['https://content.test'],
    })

    assert.deepEqual(created, [UNSEEN_URL])
    assert.deepEqual(assigned, [UNSEEN_URL])
    assert.equal(result.jwt, 'signed-jwt')
    assert.equal(signed.length, 1)
  })

  it('refuses an unseen disallowed url and signs nothing', async () => {
    // "Returned no content item" is otherwise indistinguishable from a thrown
    // error, so the assertion that matters is that the key store was never
    // asked to sign: no signed content item reaches Canvas for a URL Modulus
    // will not accept.
    const { error, signed, created, assigned } = await handleExpectingFailure(
      'https://elsewhere.test/newly-typed',
      { known: [], allowedOrigins: ['https://content.test'] }
    )

    assert.equal(error?.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
    assert.deepEqual(error?.details, {
      rejected: [{ url: 'https://elsewhere.test/newly-typed', reason: 'activity_url_not_allowed' }],
    })
    assert.deepEqual(signed, [])
    assert.deepEqual(created, [])
    assert.deepEqual(assigned, [])
  })

  it('links a known grandfathered url that no enabled rule matches', async () => {
    // An enabled rule exists and does not match, yet the activity is known, so
    // deep linking it is unaffected. Editing site policy must never withdraw
    // an instructor's existing content. (Zero rules would admit it anyway, so
    // they could not show grandfathering.)
    const { result, created, assigned } = await handle(ACTIVITY_URL, {
      known: [ACTIVITY_URL],
      allowedOrigins: NONMATCHING_RULE,
    })

    assert.deepEqual(created, [])
    assert.deepEqual(assigned, [ACTIVITY_URL])
    assert.equal(result.jwt, 'signed-jwt')
  })

  it('still enforces the code url_prefix against a known grandfathered url', async () => {
    // The prefix survives grandfathering: it is an independent,
    // instructor-managed curriculum constraint, not part of the sitewide
    // policy, and it cannot be satisfied by an activity merely being known.
    const attempt = await handleExpectingFailure(ACTIVITY_URL, {
      known: [ACTIVITY_URL],
      allowedOrigins: NONMATCHING_RULE,
      urlPrefix: 'https://other.test/',
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_MISMATCH')
    assertNoEffects(attempt)
  })

  it('enforces the code url_prefix before the allowlist, creating no activity', async () => {
    // The two rules are ANDed and the prefix runs first: a URL the sitewide
    // policy would admit is still refused by the code's own prefix, and no
    // activity row is created on the way to that refusal.
    const attempt = await handleExpectingFailure(UNSEEN_URL, {
      known: [],
      allowedOrigins: ['https://content.test'],
      urlPrefix: 'https://other.test/',
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_MISMATCH')
    assertNoEffects(attempt)
  })

  it('applies both rules when the url satisfies the prefix but not the policy', async () => {
    const { error, created } = await handleExpectingFailure(UNSEEN_URL, {
      known: [],
      allowedOrigins: NONMATCHING_RULE,
      urlPrefix: 'https://content.test/',
    })

    assert.equal(error?.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
    assert.deepEqual(created, [])
  })
})

describe('LtiDeepLinkingService code url_prefix', () => {
  it('treats an empty or absent prefix as no constraint', async () => {
    for (const urlPrefix of ['', null]) {
      const { result } = await handle(ACTIVITY_URL, { urlPrefix })
      assert.equal(result.jwt, 'signed-jwt')
    }
  })

  it('matches across canonical spelling variants of the prefix and the candidate', async () => {
    const cases: { urlPrefix: string; activityUrl: string }[] = [
      { urlPrefix: 'HTTPS://CONTENT.TEST:443/', activityUrl: ACTIVITY_URL },
      { urlPrefix: 'https://content.test/', activityUrl: 'HTTPS://Content.Test:443/activity' },
      { urlPrefix: 'https://content.test/lessons/../act', activityUrl: ACTIVITY_URL },
    ]

    for (const { urlPrefix, activityUrl } of cases) {
      const { result } = await handle(activityUrl, { urlPrefix })
      assert.equal(result.jwt, 'signed-jwt', `${activityUrl} under ${urlPrefix}`)
    }
  })

  it('completes an origin-only prefix with its root path', async () => {
    const { result } = await handle(ACTIVITY_URL, { urlPrefix: 'https://content.test' })

    assert.equal(result.jwt, 'signed-jwt')
  })

  it('keeps plain string-prefix semantics, so a prefix without a trailing slash matches a longer segment', async () => {
    const coursework = 'https://content.test/coursework'
    const { result } = await handle(coursework, {
      known: [coursework],
      urlPrefix: 'https://content.test/course',
    })

    assert.equal(result.jwt, 'signed-jwt')
  })

  it('keeps an authored trailing slash significant', async () => {
    const coursework = 'https://content.test/coursework'
    const attempt = await handleExpectingFailure(coursework, {
      known: [coursework],
      urlPrefix: 'https://content.test/course/',
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_MISMATCH')
    assertNoEffects(attempt)
  })

  it('does not match a different origin that merely normalizes nearby', async () => {
    // Host aliases and trailing host dots stay distinct.
    for (const urlPrefix of ['https://www.content.test/', 'https://content.test./']) {
      const attempt = await handleExpectingFailure(ACTIVITY_URL, { urlPrefix })
      assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_MISMATCH', urlPrefix)
      assertNoEffects(attempt)
    }
  })

  it('refuses a stored prefix with unsupported components rather than dropping the constraint', async () => {
    // Rows written before prefixes were canonicalized can carry these. The
    // candidate would match the prefix with its components removed, which is
    // exactly the silent acceptance this must not produce.
    for (const urlPrefix of [
      'https://content.test/?course=1',
      'https://content.test/#section',
      'https://content.test/?',
      'https://content.test/#',
    ]) {
      const attempt = await handleExpectingFailure(ACTIVITY_URL, { urlPrefix })
      assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_INVALID', urlPrefix)
      assertNoEffects(attempt)
    }
  })

  it('refuses a stored prefix that does not parse', async () => {
    const attempt = await handleExpectingFailure(ACTIVITY_URL, { urlPrefix: 'content.test/course' })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_INVALID')
    assertNoEffects(attempt)
  })

  it('reports an invalid prefix as invalid even when the candidate would not match it', async () => {
    // The invalid-prefix error takes precedence: the instructor has to fix the
    // code before any activity URL could be judged against it.
    const attempt = await handleExpectingFailure(ACTIVITY_URL, {
      urlPrefix: 'https://other.test/?course=1',
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_INVALID')
  })

  it('logs a prefix mismatch at warn with a fixed message and neither url nor prefix', async () => {
    const logLines: string[] = []
    const submitted = 'https://submitted-host.test/typed-lesson'
    const urlPrefix = 'https://stored-prefix-host.test/stored-course/'

    const attempt = await handleExpectingFailure(submitted, {
      known: [submitted],
      urlPrefix,
      logLines,
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_MISMATCH')
    assert.equal(attempt.error?.message, 'activity url does not match the activity code url prefix')
    assert.equal(attempt.error?.details, undefined)

    assert.equal(logLines.length, 1)
    const record = JSON.parse(logLines[0] ?? '{}') as { level: number }
    assert.equal(record.level, 40)
    const output = logLines.join('')
    assert.match(output, /ERR_DEEP_LINK_PREFIX_MISMATCH/)
    for (const fragment of [
      'submitted-host',
      'typed-lesson',
      'stored-prefix-host',
      'stored-course',
    ]) {
      assert.ok(!output.includes(fragment), `log output must not contain ${fragment}`)
    }
  })

  it('logs an invalid prefix at warn with a fixed message and none of its components', async () => {
    const logLines: string[] = []
    const submitted = 'https://submitted-host.test/typed-lesson'
    const urlPrefix =
      'https://stored-prefix-host.test/stored-course?prefix-query=secret#prefix-fragment'

    const attempt = await handleExpectingFailure(submitted, {
      known: [submitted],
      urlPrefix,
      logLines,
    })

    assert.equal(attempt.error?.code, 'ERR_DEEP_LINK_PREFIX_INVALID')
    assert.equal(attempt.error?.message, 'activity code url prefix is invalid')
    assert.equal(attempt.error?.details, undefined)

    assert.equal(logLines.length, 1)
    const record = JSON.parse(logLines[0] ?? '{}') as {
      level: number
      extra?: { reason?: string }
    }
    assert.equal(record.level, 40)
    assert.equal(record.extra?.reason, 'unsupported_url_components')
    const output = logLines.join('')
    for (const fragment of [
      'submitted-host',
      'typed-lesson',
      'stored-prefix-host',
      'stored-course',
      'prefix-query',
      'secret',
      'prefix-fragment',
    ]) {
      assert.ok(!output.includes(fragment), `log output must not contain ${fragment}`)
    }
  })
})

describe('LtiDeepLinkingService defensive activity url validation', () => {
  // The command schema rejects all of these first; these calls go straight to
  // the service to prove it does not rely on that.
  const cases: { activityUrl: string; reason: keyof typeof INSTRUCTOR_ACTIVITY_URL_MESSAGES }[] = [
    {
      activityUrl: 'https://content.test/activity?existing=one',
      reason: 'unsupported_url_components',
    },
    { activityUrl: 'https://content.test/activity#authored', reason: 'unsupported_url_components' },
    { activityUrl: 'https://content.test/activity?', reason: 'unsupported_url_components' },
    { activityUrl: 'https://content.test/activity#', reason: 'unsupported_url_components' },
    { activityUrl: 'not a url', reason: 'malformed_url' },
  ]

  it('rejects an unsupported or malformed url even when the query-free activity is known', async () => {
    for (const { activityUrl, reason } of cases) {
      const attempt = await handleExpectingFailure(activityUrl, { known: [ACTIVITY_URL] })

      assert.equal(attempt.error?.code, 'ERR_VALIDATION', activityUrl)
      assert.deepEqual(attempt.error?.details, {
        issues: [
          {
            code: 'custom',
            path: ['activity_url'],
            message: INSTRUCTOR_ACTIVITY_URL_MESSAGES[reason],
          },
        ],
      })
      assertNoEffects(attempt)
    }
  })

  it('validates the activity url before the prefix', async () => {
    // Otherwise a query-bearing URL could be reported as a prefix problem.
    const attempt = await handleExpectingFailure('https://content.test/activity?x=1', {
      urlPrefix: 'https://other.test/',
    })

    assert.equal(attempt.error?.code, 'ERR_VALIDATION')
  })

  it('accepts encoded delimiters as ordinary path characters', async () => {
    const encoded = 'https://content.test/activity%3Fx%23y'
    const { custom } = await handle(encoded, { known: [encoded] })

    assert.equal(custom.modulus_activity_url, encoded)
  })

  it('logs the rejection without the submitted url or its components', async () => {
    const logLines: string[] = []

    await handleExpectingFailure(
      'https://submitted-host.test/lesson?query-value=1#fragment-value',
      {
        logLines,
      }
    )

    const output = logLines.join('')
    assert.match(output, /ERR_VALIDATION/)
    for (const fragment of ['submitted-host', 'query-value', 'fragment-value']) {
      assert.ok(!output.includes(fragment), `log output must not contain ${fragment}`)
    }
  })
})
