import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CLAIM_DEEP_LINKING_CONTENT, CLAIM_DEPLOYMENT_ID } from '../constants.js'
import { LtiDeepLinkingService } from './deep-link.js'
import type { UrlBuilder } from '@/config.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type {
  ActivityMutations,
  ActivityQueries,
} from '@/modules/app/activities/repository/index.js'
import type { LtiQueries } from '../repository/index.js'
import type { DeepLinkingContentItem } from '../types/messages/tool-originating/deep-linking-response.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const LTI_LAUNCH_URL = 'https://modulus.test/lti/launch'
const ACTIVITY_URL = 'https://content.test/activity?existing=one#authored'
const ACTIVITY_CODE = 'course-code'
const DEPLOYMENT_ID = 'deployment-17'

const createService = () => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()
  const activityId = uuidv7()
  /** The payload handed to the key store, so the signed response can be read. */
  const signed: Record<string, unknown>[] = []

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
          url_prefix: null,
        }),
        isMember: async () => true,
        findActivityByURL: async () => ({ id: activityId, url: ACTIVITY_URL }),
      } as unknown as ActivityQueries,
      mutations: {
        createActivity: async () => ({ id: activityId, url: ACTIVITY_URL }),
        assignActivitiesToActivityCode: async () => undefined,
      } as unknown as ActivityMutations,
    },
    ltiKeyStore: {
      signPlatformMessage: async (payload: Record<string, unknown>) => {
        signed.push(payload)
        return 'signed-jwt'
      },
    } as unknown as LtiKeyStore,
  })

  return { service, userId, activityCodeId, signed }
}

const handle = async () => {
  const { service, userId, activityCodeId, signed } = createService()

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

  return { result, payload, items, item, url }
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
