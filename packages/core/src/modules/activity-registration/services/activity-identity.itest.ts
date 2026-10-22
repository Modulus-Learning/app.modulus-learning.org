import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { after, before, beforeEach, describe, it } from 'node:test'

import type { JWK } from 'jose'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodes,
  enrollment,
  lineitems,
  pageState,
  platforms,
  progress,
  users,
} from '@/database/schema/index.js'
import { AgentAuth, UserAuth } from '@/lib/auth.js'
import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEEP_LINKING_CONTENT,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_RESOURCE_LINK,
  CLAIM_ROLES,
  CLAIM_TARGET_LINK_URI,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'
import { seedScope, seedUser } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { Config, UrlBuilder } from '@/config.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { AgentTokenIssuer } from '@/modules/agent/auth/services/token-issuer.js'
import type { DeepLinkingContentItem } from '@/modules/app/lti/types/messages/tool-originating/deep-linking-response.js'
import type { SignInResult } from '@/modules/app/session/schemas.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'

/**
 * One canonical activity across every flow that resolves an activity URL.
 *
 * Each flow here receives a *different* noncanonical spelling of the same
 * activity: the deep link registers one, the resource-link launch claims
 * another, the agent authorizes with a third, and the progress and page-state
 * reads use a fourth. Any reader still looking up the spelling it was handed
 * would miss the stored row, so this file fails if any one of them regresses --
 * which is the point of testing them together rather than one at a time.
 *
 * Real repositories and services resolve identity throughout. Only the outbound
 * effects are faked, and narrowly: the LMS JWKS endpoint (a local HTTP server
 * serving one generated key), deep-link signing, LTI sign-in, and both token
 * issuers, whose recorded payloads are how the issued agent token's activity is
 * inspected at all.
 */

let h: TestHarness

const ORIGIN = 'https://content.test'
const ISSUER = 'https://canvas.identity.test'
const MODULUS_URL = 'https://modulus.identity.test'
const CANVAS_TERM_ID = 'term-autumn-2026'

/** The path both the deep link and every later flow must agree on. */
const PATH = '/mooculus/calculus1/whatIsALimit/digInContinuity'

/** The canonical key: what every reader must look up and what must be stored. */
const CANONICAL = `${ORIGIN}${PATH}`

/** The instructor's spelling: uppercase, explicit default port, dot segment. */
const DEEP_LINK_SPELLING =
  'HTTPS://CONTENT.TEST:443/mooculus/calculus1/whatIsALimit/./digInContinuity'

/** The platform's re-serialization of the published link, with transport junk. */
const LAUNCH_CLAIM_SPELLING = `https://content.test:443${PATH}?lms=canvas&attempt=3#top`

/** The agent's OAuth callback, spelled with an explicit default port. */
const OAUTH_REDIRECT_URI = `https://content.test:443${PATH}`

/** The learner's browser location, mid-exercise. */
const BROWSER_LOCATION = `https://Content.Test${PATH}?exercise=17#answer`

/** The same page after the learner advances -- a different location, one activity. */
const LATER_BROWSER_LOCATION = `${ORIGIN}${PATH}?exercise=18#hint`

const urlBuilder = {
  baseUrl: MODULUS_URL,
  ltiLaunchUrl: `${MODULUS_URL}/routes/lti/launch`,
  dashboardUrl: `${MODULUS_URL}/dashboard`,
} as UrlBuilder

const config = { server: { baseUrl: MODULUS_URL } } as Config

/** Serves one generated public key, standing in for the platform's JWKS. */
const startJwksServer = async (jwk: JWK) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ keys: [jwk] }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  assert.ok(address != null && typeof address !== 'string')

  return {
    uri: `http://127.0.0.1:${address.port}/jwks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

let jwks: Awaited<ReturnType<typeof startJwksServer>>
let privateKey: CryptoKey

before(async () => {
  h = await setupTestHarness()

  const keyPair = await generateKeyPair('RS256')
  privateKey = keyPair.privateKey
  const jwk: JWK = {
    ...(await exportJWK(keyPair.publicKey)),
    kid: 'identity-test-key',
    alg: 'RS256',
    use: 'sig',
  }
  jwks = await startJwksServer(jwk)
})

after(async () => {
  await jwks.close()
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

/** Records the deep-linking payload instead of signing it. */
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

/** Records the activity each issued agent access token names. */
const makeAgentTokenIssuer = () => {
  const issued: { user_id: string; activity_id: string; scope_id: string }[] = []
  const tokenIssuer = {
    createAccessToken: async ({
      user,
      activity,
      scope_id,
    }: {
      user: { id: string }
      activity: { id: string }
      scope_id: string
    }) => {
      issued.push({ user_id: user.id, activity_id: activity.id, scope_id })
      return `agent-access-token-${issued.length}`
    },
  } as unknown as AgentTokenIssuer
  return { tokenIssuer, issued }
}

/** Signs the launching learner in as an already-seeded user. */
const makeSignIn = (userId: string) => {
  const signIn: SignInResult = {
    user: { id: userId, full_name: 'Test Learner' },
    abilities: [],
    remember_me: false,
  }
  return {
    ltiSignInService: {
      signInLti: async () => signIn,
    } as unknown as LtiSignInService,
    tokenIssuer: {
      createTokens: async () => ({
        access: { token: 'access-token', expiration_in_ms: 60_000 },
        refresh: { token: 'refresh-token', expiration_in_ms: 120_000 },
        remember_me: false,
      }),
    } as unknown as TokenIssuer,
  }
}

const signResourceLinkLaunch = async ({
  nonce,
  activityCode,
  activityUrl,
  lineitemUrl,
}: {
  nonce: string
  activityCode: string
  activityUrl: string
  lineitemUrl: string
}) =>
  await new SignJWT({
    sub: 'canvas-learner-1',
    nonce,
    [CLAIM_VERSION]: '1.3.0',
    [CLAIM_DEPLOYMENT_ID]: 'deployment-17',
    [CLAIM_TARGET_LINK_URI]: `${MODULUS_URL}/routes/lti/launch`,
    [CLAIM_ROLES]: [],
    [CLAIM_AGS_ENDPOINT]: {
      lineitem: lineitemUrl,
      scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
    },
    [CLAIM_CUSTOM]: {
      modulus_launch_type: 'start-activity',
      modulus_activity_code: activityCode,
      modulus_activity_url: activityUrl,
      'Canvas.term.id': CANVAS_TERM_ID,
      'Canvas.term.name': 'Autumn 2026',
    },
    [CLAIM_MESSAGE_TYPE]: 'LtiResourceLinkRequest',
    [CLAIM_RESOURCE_LINK]: { id: 'resource-link-1' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'identity-test-key' })
    .setIssuer(ISSUER)
    .setAudience('identity-client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

/**
 * Seeds the instructor, the platform (pointing at the local JWKS), the activity
 * code the instructor owns, and one pending deep-link launch.
 */
const seedDeepLinkContext = async () => {
  const instructorId = await seedUser(h.db)
  const activityCodeId = uuidv7()
  const launchId = uuidv7()
  const code = `code-${activityCodeId}`

  const [platform] = await h.db
    .insert(platforms)
    .values({
      id: uuidv7(),
      issuer: ISSUER,
      name: 'Canvas',
      client_id: 'identity-client',
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: jwks.uri,
      authorization_server: ISSUER,
    })
    .returning()
  assert.ok(platform != null)

  await h.db.insert(activityCodes).values({
    id: activityCodeId,
    code,
    private_code: `private-${activityCodeId}`,
    // A prefix spelled unlike the canonical activity, so the deep link only
    // succeeds if both sides are canonicalized before comparison.
    url_prefix: 'HTTPS://CONTENT.TEST:443/mooculus/',
    created_by: instructorId,
  })
  await h.repos.appActivityMutations.addMember(activityCodeId, instructorId)
  await h.repos.ltiMutations.insertPendingDeepLink({
    id: launchId,
    user_id: instructorId,
    issuer: ISSUER,
    deployment_id: 'deployment-17',
    deep_linking_data: 'opaque',
    return_url: `${ISSUER}/deep_link_return`,
    context: 'assignment',
    expires_at: new Date(Date.now() + 60_000),
  })

  // An enabled rule covering the origin, so admission is actually evaluated
  // rather than falling through the zero-rule allow-all case.
  await h.repos.allowlistMutations.createRule({
    id: uuidv7(),
    origin: ORIGIN,
    path_prefix: '/',
  })

  return {
    instructorAuth: new UserAuth(instructorId, []),
    activityCodeId,
    code,
    platformId: platform.id,
    launchId,
  }
}

/**
 * Inserts a learner the agent token exchange will accept.
 *
 * `users.is_enabled` defaults to false, and `claimAuthCode()` refuses a
 * disabled user before it ever resolves the activity.
 */
const seedEnabledUser = async (): Promise<string> => {
  const id = uuidv7()
  await h.db.insert(users).values({ id, is_enabled: true })
  return id
}

/** The single content item of a signed deep-linking response. */
const contentItem = (payload: Record<string, unknown> | undefined): DeepLinkingContentItem => {
  const [item] = (payload?.[CLAIM_DEEP_LINKING_CONTENT] ?? []) as DeepLinkingContentItem[]
  assert.ok(item != null, 'expected a signed content item')
  return item
}

const storedActivities = async () => await h.db.select().from(activities)

const progressRows = async () => await h.db.select().from(progress)

const pageStateRows = async () => await h.db.select().from(pageState)

describe('canonical activity identity across deep linking, launch, auth, and state', () => {
  it('resolves one activity for every flow that receives a different spelling', async () => {
    const { instructorAuth, activityCodeId, code, launchId } = await seedDeepLinkContext()
    const learnerId = await seedEnabledUser()

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 1. The instructor deep links a noncanonical spelling.
    const { ltiKeyStore, signed } = makeKeyStore()
    await h.services.makeDeepLinking({ urlBuilder, ltiKeyStore }).handleDeepLink(instructorAuth, {
      launch_id: launchId,
      activity_code_id: activityCodeId,
      activity_url: DEEP_LINK_SPELLING,
    })

    const stored = await storedActivities()
    assert.equal(stored.length, 1)
    const [activity] = stored
    assert.ok(activity != null)
    assert.equal(activity.url, CANONICAL)

    // The durable content item carries the resolved canonical URL and a target
    // name built from the public code and the resolved id.
    const item = contentItem(signed[0])
    assert.equal((item.custom as Record<string, string>).modulus_activity_url, CANONICAL)
    assert.deepEqual(item.window, { targetName: `modulus-${code}-${activity.id}` })

    const associations = await h.db.select().from(activityActivityCode)
    assert.deepEqual(
      associations.map((row) => [row.activity_code_id, row.activity_id]),
      [[activityCodeId, activity.id]]
    )

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 2. Canvas launches the published link, re-serialized and carrying a query
    //    and fragment the tool never asked for.
    // `lti_nonces.nonce` is varchar(40), so the bare uuid is the whole value.
    const nonce = uuidv7()
    await h.repos.ltiMutations.insertNonce(nonce)
    const lineitemUrl = `${ISSUER}/lineitems/1`
    const launch = h.services.makeLtiLaunch({ config, ...makeSignIn(learnerId) })

    const response = await launch.handleLaunch({
      id_token: await signResourceLinkLaunch({
        nonce,
        activityCode: code,
        activityUrl: LAUNCH_CLAIM_SPELLING,
        lineitemUrl,
      }),
      issuer: ISSUER,
    })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.activity_id, activity.id)
    // The destination comes from the stored row: no incoming query or fragment.
    assert.equal(response.activity_url, CANONICAL)
    const scopeId = response.scope_id
    assert.notEqual(scopeId, undefined)

    // The AGS line item the LMS will be scored against names the same activity.
    const lineItems = await h.db.select().from(lineitems)
    assert.equal(lineItems.length, 1)
    const [lineItem] = lineItems
    assert.ok(lineItem != null)
    assert.equal(lineItem.activity_id, activity.id)
    assert.equal(lineItem.user_id, learnerId)
    assert.equal(lineItem.scope_id, scopeId)
    assert.equal(lineItem.lineitem_url, lineitemUrl)

    // The launch enrolled the learner under the deep-linked code, which it can
    // only do if the claim resolved to an activity associated with that code.
    assert.deepEqual(
      (await h.db.select().from(enrollment)).map((row) => [row.activity_code_id, row.user_id]),
      [[activityCodeId, learnerId]]
    )

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 3. The agent authorizes from the learner's page, with its own spelling.
    const { tokenIssuer, issued } = makeAgentTokenIssuer()
    const agentAuth = h.services.makeAgentAuth({ config, tokenIssuer })
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256')
      .update(codeVerifier, 'utf8')
      .digest()
      .toString('base64url')

    const { code: authCode } = await agentAuth.createAuthCode(new UserAuth(learnerId, []), {
      client_id: OAUTH_REDIRECT_URI,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_challenge: codeChallenge,
      scope_id: scopeId,
    })

    // Authorization registered the callback's canonical key, which is the
    // activity the deep link already created -- not a second row.
    assert.deepEqual(
      (await storedActivities()).map((row) => row.url),
      [CANONICAL]
    )

    const claimed = await agentAuth.claimAuthCode({
      code: authCode,
      client_id: OAUTH_REDIRECT_URI,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
    })

    assert.equal(claimed.scope_id, scopeId)
    assert.deepEqual(issued, [{ user_id: learnerId, activity_id: activity.id, scope_id: scopeId }])

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 4. The token-bound agent writes and reads progress and page state.
    const tokenAuth = new AgentAuth(learnerId, activity.id, scopeId, 0)

    await h.services.activityProgress.setProgress(tokenAuth, {
      progress_for_current_page: 0.4,
      increments_for_other_pages: [],
    })
    await h.services.activityPageState.setPageState(tokenAuth, {
      page_state: { answers: { 'exercise-17': 'x = 3' } },
    })

    // A read addressed by the learner's browser location resolves the same row
    // and answers with the spelling as requested.
    const read = await h.services.activityProgress.getProgress(tokenAuth, {
      urls: [BROWSER_LOCATION],
    })
    assert.equal(read.progress, 0.4)
    assert.deepEqual(read.others, [{ url: BROWSER_LOCATION, progress: 0.4 }])

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 5. The learner moves to the next exercise: a new location, same activity,
    //    same learner and scope -- so the same progress and page state.
    const advanced = await h.services.activityProgress.setProgress(tokenAuth, {
      progress_for_current_page: 0.75,
      increments_for_other_pages: [],
    })
    assert.equal(advanced.progress, 0.75)

    const laterRead = await h.services.activityProgress.getProgress(tokenAuth, {
      urls: [LATER_BROWSER_LOCATION, BROWSER_LOCATION],
    })
    assert.equal(laterRead.progress, 0.75)
    assert.deepEqual(laterRead.others, [
      { url: LATER_BROWSER_LOCATION, progress: 0.75 },
      { url: BROWSER_LOCATION, progress: 0.75 },
    ])

    const pageStateRead = await h.services.activityPageState.getPageState(tokenAuth)
    assert.deepEqual(pageStateRead.page_state, { answers: { 'exercise-17': 'x = 3' } })

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Every flow agreed on one activity, and each wrote exactly one state row.
    assert.deepEqual(
      (await storedActivities()).map((row) => row.url),
      [CANONICAL]
    )
    assert.deepEqual(
      (await progressRows()).map((row) => [row.activity_id, row.user_id, row.scope_id]),
      [[activity.id, learnerId, scopeId]]
    )
    assert.deepEqual(
      (await pageStateRows()).map((row) => [row.activity_id, row.user_id, row.scope_id]),
      [[activity.id, learnerId, scopeId]]
    )
  })

  it('keeps another learner and another scope independent of that state', async () => {
    const { instructorAuth, activityCodeId, launchId, platformId } = await seedDeepLinkContext()
    const learnerId = await seedUser(h.db)

    await h.services
      .makeDeepLinking({ urlBuilder, ...makeKeyStore() })
      .handleDeepLink(instructorAuth, {
        launch_id: launchId,
        activity_code_id: activityCodeId,
        activity_url: DEEP_LINK_SPELLING,
      })

    const [activity] = await storedActivities()
    assert.ok(activity != null)
    assert.equal(activity.url, CANONICAL)

    const termScopeId = await seedScope(h.db, platformId)
    const otherScopeId = await seedScope(h.db, platformId)
    const otherLearnerId = await seedUser(h.db)

    const learnerAuth = new AgentAuth(learnerId, activity.id, termScopeId, 0)
    await h.services.activityProgress.setProgress(learnerAuth, {
      progress_for_current_page: 0.6,
      increments_for_other_pages: [],
    })
    await h.services.activityPageState.setPageState(learnerAuth, {
      page_state: { answers: { 'exercise-17': 'x = 3' } },
    })

    // Same activity, same learner, a different academic scope: no shared state.
    const otherScopeRead = await h.services.activityProgress.getProgress(
      new AgentAuth(learnerId, activity.id, otherScopeId, 0),
      { urls: [BROWSER_LOCATION] }
    )
    assert.equal(otherScopeRead.progress, 0)
    assert.deepEqual(otherScopeRead.others, [{ url: BROWSER_LOCATION, progress: 0 }])
    assert.deepEqual(
      (
        await h.services.activityPageState.getPageState(
          new AgentAuth(learnerId, activity.id, otherScopeId, 0)
        )
      ).page_state,
      {}
    )

    // Same activity and scope, a different learner: likewise independent.
    const otherLearnerAuth = new AgentAuth(otherLearnerId, activity.id, termScopeId, 0)
    const otherLearnerRead = await h.services.activityProgress.getProgress(otherLearnerAuth, {
      urls: [LATER_BROWSER_LOCATION],
    })
    assert.equal(otherLearnerRead.progress, 0)
    assert.deepEqual(otherLearnerRead.others, [{ url: LATER_BROWSER_LOCATION, progress: 0 }])
    assert.deepEqual(
      (await h.services.activityPageState.getPageState(otherLearnerAuth)).page_state,
      {}
    )

    // The spelling variants never created a second activity, and only the one
    // learner/scope pair that wrote state has any.
    assert.deepEqual(
      (await storedActivities()).map((row) => row.url),
      [CANONICAL]
    )
    assert.deepEqual(
      (await progressRows()).map((row) => [row.user_id, row.scope_id]),
      [[learnerId, termScopeId]]
    )
    assert.deepEqual(
      (await pageStateRows()).map((row) => [row.user_id, row.scope_id]),
      [[learnerId, termScopeId]]
    )
  })
})
