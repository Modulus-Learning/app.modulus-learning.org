import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { parseAdmissibleUrl } from '@/modules/activity-registration/url-policy.js'
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

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const LTI_LAUNCH_URL = 'https://modulus.test/routes/lti/launch'
const ACTIVITY_URL = 'https://content.test/activity?existing=one#authored'
const ACTIVITY_CODE = 'course-code'
const DEPLOYMENT_ID = 'deployment-17'

/**
 * @param urlPrefix       the activity code's own `url_prefix`, checked ahead of
 *                        the sitewide policy and independent of it.
 * @param known           URLs that already have an activity row. A known URL is
 *                        admitted with no policy evaluation -- grandfathering.
 * @param allowedOrigins  the enabled policy. Empty denies every unseen URL.
 */
const createService = ({
  urlPrefix = null,
  known = [ACTIVITY_URL],
  allowedOrigins = [],
}: {
  urlPrefix?: string | null
  known?: string[]
  allowedOrigins?: string[]
} = {}) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  const activityId = uuidv7()
  /** The payload handed to the key store, so the signed response can be read. */
  const signed: Record<string, unknown>[] = []
  const rows = new Map<string, ActivityRecord>(
    known.map((url) => [url, { id: activityId, url } as ActivityRecord])
  )
  const created: string[] = []
  const assigned: string[] = []

  const registration = {
    loadPolicy: async (): Promise<PolicySnapshot> => ({
      rules: allowedOrigins.map((origin) => ({ origin, path_prefix: '/' })),
    }),
    register: async (url: string, policy: PolicySnapshot): Promise<RegistrationOutcome> => {
      // Known first, with no policy consulted -- the grandfathering order.
      const existing = rows.get(url)
      if (existing !== undefined) {
        return { ok: true, activity: existing }
      }

      if (url.length > 255) {
        return { ok: false, url, reason: 'url_too_long' }
      }

      // The real parser, so the fake cannot disagree with production about
      // what `malformed_url` means.
      const candidate = parseAdmissibleUrl(url)
      if (candidate === null) {
        return { ok: false, url, reason: 'malformed_url' }
      }
      if (!policy.rules.some((rule) => rule.origin === candidate.origin)) {
        return { ok: false, url, reason: 'activity_url_not_allowed' }
      }

      const activity = { id: uuidv7(), url } as ActivityRecord
      rows.set(url, activity)
      created.push(url)
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
        user_id: userId,
        issuer: 'https://canvas.test',
        deployment_id: DEPLOYMENT_ID,
        deep_linking_data: 'opaque-platform-data',
        return_url: 'https://canvas.test/deep_link_return',
        context: 'assignment',
        expires_at: new Date(Date.now() + 60_000),
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
          code: ACTIVITY_CODE,
          url_prefix: urlPrefix,
        }),
        isMember: async () => true,
        findActivityByURL: async () => {
          throw new Error('findActivityByURL must not be used: registration resolves the row')
        },
      } as unknown as ActivityQueries,
      mutations: {
        createActivity: async () => {
          throw new Error('createActivity must not be used: registration is the only writer')
        },
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

  return { service, userId, activityCodeId, signed, created, assigned }
}

const handle = async (options: Parameters<typeof createService>[0] = {}) => {
  const { service, userId, activityCodeId, signed, created, assigned } = createService(options)

  const result = await service.handleDeepLink(new UserAuth(userId, []), {
    launch_id: 'launch-1',
    activity_code_id: activityCodeId,
    activity_url: ACTIVITY_URL,
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

  return { result, payload, items, item, url, created, assigned }
}

/** Runs a deep link expected to fail, and reports what was attempted. */
const handleExpectingFailure = async (
  activityUrl: string,
  options: Parameters<typeof createService>[0] = {}
) => {
  const { service, userId, activityCodeId, signed, created, assigned } = createService(options)

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

  return { error, signed, created, assigned }
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

  it('leaves the window target name unchanged', async () => {
    const { item } = await handle()

    assert.deepEqual(item.window, { targetName: `modulus-${ACTIVITY_CODE}-${ACTIVITY_URL}` })
  })

  it('leaves the custom claims carrying the resource identity unchanged', async () => {
    const { item } = await handle()
    const custom = item.custom as Record<string, string>

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

describe('LtiDeepLinkingService activity url allowlist', () => {
  const UNSEEN_URL = 'https://content.test/newly-typed'

  it('registers an unseen allowed url, associates it and returns a content item', async () => {
    const { service, userId, activityCodeId, signed, created, assigned } = createService({
      known: [],
      allowedOrigins: ['https://content.test'],
    })

    const result = await service.handleDeepLink(new UserAuth(userId, []), {
      launch_id: 'launch-1',
      activity_code_id: activityCodeId,
      activity_url: UNSEEN_URL,
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

  it('links a known grandfathered url under an empty policy', async () => {
    // No rule matches it and no rule exists at all, yet the activity is known,
    // so deep linking it is unaffected. Editing site policy must never
    // withdraw an instructor's existing content.
    const { result, created, assigned } = await handle({
      known: [ACTIVITY_URL],
      allowedOrigins: [],
    })

    assert.deepEqual(created, [])
    assert.deepEqual(assigned, [ACTIVITY_URL])
    assert.equal(result.jwt, 'signed-jwt')
  })

  it('still enforces the code url_prefix against a known grandfathered url', async () => {
    // The prefix survives grandfathering: it is an independent,
    // instructor-managed curriculum constraint, not part of the sitewide
    // policy, and it cannot be satisfied by an activity merely being known.
    const { error, signed, assigned } = await handleExpectingFailure(ACTIVITY_URL, {
      known: [ACTIVITY_URL],
      allowedOrigins: [],
      urlPrefix: 'https://other.test/',
    })

    assert.equal(error?.code, 'ERR_DEEP_LINKING')
    assert.match(error?.message ?? '', /activity url must start with/i)
    assert.deepEqual(assigned, [])
    assert.deepEqual(signed, [])
  })

  it('enforces the code url_prefix before the allowlist, creating no activity', async () => {
    // The two rules are ANDed and the prefix runs first: a URL the sitewide
    // policy would admit is still refused by the code's own prefix, and no
    // activity row is created on the way to that refusal.
    const { error, created, signed } = await handleExpectingFailure(UNSEEN_URL, {
      known: [],
      allowedOrigins: ['https://content.test'],
      urlPrefix: 'https://other.test/',
    })

    assert.equal(error?.code, 'ERR_DEEP_LINKING')
    assert.deepEqual(created, [])
    assert.deepEqual(signed, [])
  })

  it('applies both rules when the url satisfies the prefix but not the policy', async () => {
    const { error, created } = await handleExpectingFailure(UNSEEN_URL, {
      known: [],
      allowedOrigins: [],
      urlPrefix: 'https://content.test/',
    })

    assert.equal(error?.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
    assert.deepEqual(created, [])
  })
})
