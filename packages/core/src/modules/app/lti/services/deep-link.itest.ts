import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodes,
  platforms,
  users,
} from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { UrlBuilder } from '@/config.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'

let h: TestHarness

before(async () => {
  h = await setupTestHarness()
})

after(async () => {
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

const ORIGIN = 'https://content.test'
const ISSUER = 'https://canvas.test'

const urlBuilder = {
  baseUrl: 'https://modulus.test',
  ltiLaunchUrl: 'https://modulus.test/routes/lti/launch',
  dashboardUrl: 'https://modulus.test/dashboard',
} as UrlBuilder

/** Counts signing calls, so an unsigned refusal is distinguishable from a throw. */
const makeKeyStore = () => {
  const signed: Record<string, unknown>[] = []
  const ltiKeyStore = {
    signPlatformMessage: async (payload: Record<string, unknown>) => {
      signed.push(payload)
      return 'signed-jwt'
    },
  } as unknown as LtiKeyStore
  return { ltiKeyStore, signed }
}

/**
 * Seeds an instructor, a platform, an activity code the instructor belongs to,
 * and one pending deep-link launch per launch id.
 */
const seedLaunch = async (launchIds: string[]) => {
  const userId = uuidv7()
  const activityCodeId = uuidv7()

  await h.db.insert(users).values({ id: userId, full_name: 'Test Instructor' })
  await h.db.insert(platforms).values({
    id: uuidv7(),
    issuer: ISSUER,
    name: 'Canvas',
    client_id: 'client-1',
    authorization_endpoint: `${ISSUER}/auth`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
    authorization_server: ISSUER,
  })
  await h.db.insert(activityCodes).values({
    id: activityCodeId,
    code: `code-${activityCodeId}`,
    private_code: `private-${activityCodeId}`,
    created_by: userId,
  })
  await h.repos.appActivityMutations.addMember(activityCodeId, userId)

  for (const launchId of launchIds) {
    await h.repos.ltiMutations.insertPendingDeepLink({
      id: launchId,
      user_id: userId,
      issuer: ISSUER,
      deployment_id: 'deployment-17',
      deep_linking_data: 'opaque',
      return_url: `${ISSUER}/deep_link_return`,
      context: 'assignment',
      expires_at: new Date(Date.now() + 60_000),
    })
  }

  return { userAuth: new UserAuth(userId, []), activityCodeId }
}

const seedRule = async (origin = ORIGIN): Promise<void> => {
  await h.repos.allowlistMutations.createRule({ id: uuidv7(), origin, path_prefix: '/' })
}

const countActivities = async (url: string): Promise<number> =>
  (await h.db.select().from(activities)).filter((row) => row.url === url).length

describe('LtiDeepLinkingService.handleDeepLink over PostgreSQL', () => {
  it('resolves two concurrent deep links of the same unseen url to one activity row', async () => {
    // The race this path loses today: it is the one writer that does not use
    // `onConflictDoNothing`, so two instructors deep linking the same new URL
    // at the same moment surface a unique-constraint error to one of them.
    await seedRule()
    const launchA = uuidv7()
    const launchB = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchA, launchB])
    const url = `${ORIGIN}/shared-new-page`

    const first = h.services.makeDeepLinking({ urlBuilder, ...makeKeyStore() })
    const second = h.services.makeDeepLinking({ urlBuilder, ...makeKeyStore() })

    const [a, b] = await Promise.all([
      first.handleDeepLink(userAuth, {
        launch_id: launchA,
        activity_code_id: activityCodeId,
        activity_url: url,
      }),
      second.handleDeepLink(userAuth, {
        launch_id: launchB,
        activity_code_id: activityCodeId,
        activity_url: url,
      }),
    ])

    assert.equal(a.jwt, 'signed-jwt')
    assert.equal(b.jwt, 'signed-jwt')
    assert.equal(await countActivities(url), 1)

    // Both resolved to the one winning row, so the code carries one association.
    const associations = await h.db.select().from(activityActivityCode)
    assert.equal(associations.length, 1)
  })

  it('writes nothing and signs nothing when the url is denied', async () => {
    await seedRule()
    const launchId = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchId])
    const { ltiKeyStore, signed } = makeKeyStore()
    const service = h.services.makeDeepLinking({ urlBuilder, ltiKeyStore })
    const url = 'https://elsewhere.test/denied'

    await assert.rejects(
      service.handleDeepLink(userAuth, {
        launch_id: launchId,
        activity_code_id: activityCodeId,
        activity_url: url,
      }),
      (error: { code?: string }) => {
        assert.equal(error.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
        return true
      }
    )

    assert.equal(await countActivities(url), 0)
    assert.deepEqual(signed, [])
    assert.deepEqual(await h.db.select().from(activityActivityCode), [])
  })

  it('links a grandfathered activity that no enabled rule matches', async () => {
    const launchId = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchId])
    const url = `${ORIGIN}/legacy`
    await h.db.insert(activities).values({ id: uuidv7(), url })
    // The only rule points somewhere else entirely.
    await seedRule('https://somewhere-else.test')

    const service = h.services.makeDeepLinking({ urlBuilder, ...makeKeyStore() })
    const result = await service.handleDeepLink(userAuth, {
      launch_id: launchId,
      activity_code_id: activityCodeId,
      activity_url: url,
    })

    assert.equal(result.jwt, 'signed-jwt')
    assert.equal(await countActivities(url), 1)
    assert.equal((await h.db.select().from(activityActivityCode)).length, 1)
  })
})
