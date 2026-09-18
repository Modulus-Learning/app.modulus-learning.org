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
import { CLAIM_DEEP_LINKING_CONTENT } from '../constants.js'
import type { UrlBuilder } from '@/config.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { DeepLinkingContentItem } from '../types/messages/tool-originating/deep-linking-response.js'

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
const seedLaunch = async (launchIds: string[], { urlPrefix }: { urlPrefix?: string } = {}) => {
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
    url_prefix: urlPrefix,
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

/** The single content item of a signed deep-linking response. */
const contentItem = (payload: Record<string, unknown> | undefined): DeepLinkingContentItem => {
  const [item] = (payload?.[CLAIM_DEEP_LINKING_CONTENT] ?? []) as DeepLinkingContentItem[]
  assert.ok(item != null, 'expected a signed content item')
  return item
}

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

  it('resolves concurrent deep links of equivalent spellings to one canonical activity', async () => {
    await seedRule()
    const launchA = uuidv7()
    const launchB = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchA, launchB])
    const canonical = `${ORIGIN}/shared-new-page`

    const first = makeKeyStore()
    const second = makeKeyStore()

    await Promise.all([
      h.services
        .makeDeepLinking({ urlBuilder, ltiKeyStore: first.ltiKeyStore })
        .handleDeepLink(userAuth, {
          launch_id: launchA,
          activity_code_id: activityCodeId,
          activity_url: canonical,
        }),
      h.services
        .makeDeepLinking({ urlBuilder, ltiKeyStore: second.ltiKeyStore })
        .handleDeepLink(userAuth, {
          launch_id: launchB,
          activity_code_id: activityCodeId,
          activity_url: 'HTTPS://CONTENT.TEST:443/lessons/../shared-new-page',
        }),
    ])

    const rows = await h.db.select().from(activities)
    assert.deepEqual(
      rows.map(({ url }) => url),
      [canonical]
    )
    const [activity] = rows
    assert.ok(activity != null)

    const associations = await h.db.select().from(activityActivityCode)
    assert.equal(associations.length, 1)
    assert.equal(associations[0]?.activity_id, activity.id)

    // Both signed content items name the one row, whichever spelling won.
    const [code] = await h.db.select().from(activityCodes)
    assert.ok(code != null)
    for (const item of [contentItem(first.signed[0]), contentItem(second.signed[0])]) {
      assert.equal((item.custom as Record<string, string>).modulus_activity_url, canonical)
      assert.deepEqual(item.window, { targetName: `modulus-${code.code}-${activity.id}` })
    }
  })

  it('keeps one association when an existing activity is linked again by another spelling', async () => {
    const launchA = uuidv7()
    const launchB = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchA, launchB])
    const canonical = `${ORIGIN}/legacy`
    const activityId = uuidv7()
    await h.db.insert(activities).values({ id: activityId, url: canonical })

    const service = h.services.makeDeepLinking({ urlBuilder, ...makeKeyStore() })
    for (const [launch_id, activity_url] of [
      [launchA, canonical],
      [launchB, 'https://Content.Test:443/legacy'],
    ] as const) {
      await service.handleDeepLink(userAuth, {
        launch_id,
        activity_code_id: activityCodeId,
        activity_url,
      })
    }

    assert.equal((await h.db.select().from(activities)).length, 1)
    const associations = await h.db.select().from(activityActivityCode)
    assert.deepEqual(
      associations.map(({ activity_id }) => activity_id),
      [activityId]
    )
  })

  it('matches a stored prefix spelled differently from the canonical activity url', async () => {
    await seedRule()
    const launchId = uuidv7()
    const { userAuth, activityCodeId } = await seedLaunch([launchId], {
      urlPrefix: 'HTTPS://CONTENT.TEST:443/course/',
    })
    const { ltiKeyStore, signed } = makeKeyStore()

    const service = h.services.makeDeepLinking({ urlBuilder, ltiKeyStore })
    await service.handleDeepLink(userAuth, {
      launch_id: launchId,
      activity_code_id: activityCodeId,
      activity_url: `${ORIGIN}/course/lesson`,
    })

    assert.equal(signed.length, 1)
    assert.equal(await countActivities(`${ORIGIN}/course/lesson`), 1)
  })

  it('writes nothing and signs nothing for an invalid stored prefix or a prefix mismatch', async () => {
    const cases = [
      { urlPrefix: `${ORIGIN}/course/?term=1`, code: 'ERR_DEEP_LINK_PREFIX_INVALID' },
      { urlPrefix: `${ORIGIN}/other/`, code: 'ERR_DEEP_LINK_PREFIX_MISMATCH' },
    ]

    for (const { urlPrefix, code } of cases) {
      await h.truncateAll()
      await seedRule()
      const launchId = uuidv7()
      const { userAuth, activityCodeId } = await seedLaunch([launchId], { urlPrefix })
      const { ltiKeyStore, signed } = makeKeyStore()
      const service = h.services.makeDeepLinking({ urlBuilder, ltiKeyStore })

      await assert.rejects(
        service.handleDeepLink(userAuth, {
          launch_id: launchId,
          activity_code_id: activityCodeId,
          activity_url: `${ORIGIN}/course/lesson`,
        }),
        (error: { code?: string }) => {
          assert.equal(error.code, code)
          return true
        }
      )

      assert.deepEqual(await h.db.select().from(activities), [])
      assert.deepEqual(await h.db.select().from(activityActivityCode), [])
      assert.deepEqual(signed, [])
    }
  })
})
