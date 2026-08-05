import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'

import type { JWK } from 'jose'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { createCoreLogger } from '@/lib/logger.js'
import {
  CLAIM_CUSTOM,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_RESOURCE_LINK,
  CLAIM_ROLES,
  CLAIM_TARGET_LINK_URI,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'
import {
  LtiLaunchService,
  normalizeCanvasTerm,
  resolveVerifiedLaunchScope,
} from '@/modules/app/lti/services/launch.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type {
  LtiMutations,
  LtiQueries,
  PlatformRecord,
  PlatformScopeResolution,
  ScopeRecord,
} from '@/modules/app/lti/repository/index.js'
import type { UserTokens } from '@/modules/app/session/schemas.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'

const scopeRecord = (
  values: PlatformScopeResolution,
  overrides: Partial<ScopeRecord> = {}
): ScopeRecord => ({
  id: uuidv7(),
  platform_id: values.platform_id,
  external_id: values.external_id,
  name: values.name ?? null,
  starts_at: values.starts_at ?? null,
  ends_at: values.ends_at ?? null,
  last_verified_launch_at: values.last_verified_launch_at,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

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
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      }),
  }
}

describe('resolveVerifiedLaunchScope', () => {
  it('uses the sentinel for missing, empty, null, or unexpanded term ids', async () => {
    const inputs: Record<string, string | boolean | null>[] = [
      {},
      { 'Canvas.term.id': null },
      { 'Canvas.term.id': '' },
      { 'Canvas.term.id': '   ' },
      { 'Canvas.term.id': '$Canvas.term.id' },
      {
        'Canvas.term.name': 'Metadata without identity',
        'Canvas.term.startAt': '2026-08-01T00:00:00Z',
      },
    ]

    for (const custom of inputs) {
      let calls = 0
      const result = await resolveVerifiedLaunchScope(
        {
          resolvePlatformScope: async (values) => {
            calls += 1
            return scopeRecord(values)
          },
        },
        uuidv7(),
        custom
      )

      assert.deepEqual(result, { scope_id: DEFAULT_SCOPE_ID, scope_name: null })
      assert.equal(calls, 0)
    }
  })

  it('resolves an id-only term and returns only canonical activity-facing metadata', async () => {
    const platformId = uuidv7()
    const scopeId = uuidv7()
    const verifiedAt = new Date('2026-08-05T10:00:00Z')
    const calls: PlatformScopeResolution[] = []

    const result = await resolveVerifiedLaunchScope(
      {
        resolvePlatformScope: async (values) => {
          calls.push(values)
          return scopeRecord(values, { id: scopeId })
        },
      },
      platformId,
      { 'Canvas.term.id': ' 42 ' },
      verifiedAt
    )

    assert.deepEqual(calls, [
      {
        platform_id: platformId,
        external_id: '42',
        name: undefined,
        starts_at: undefined,
        ends_at: undefined,
        last_verified_launch_at: verifiedAt,
      },
    ])
    assert.deepEqual(result, { scope_id: scopeId, scope_name: null })
    assert.deepEqual(Object.keys(result).sort(), ['scope_id', 'scope_name'])
  })

  it('normalizes optional metadata independently and ignores malformed values', () => {
    const normalized = normalizeCanvasTerm({
      'Canvas.term.id': 'term-1',
      'Canvas.term.name': ' Autumn 2026 ',
      'Canvas.term.startAt': '2026-08-01T00:00:00Z',
      'Canvas.term.endAt': 'not-a-date',
    })

    assert.equal(normalized?.external_id, 'term-1')
    assert.equal(normalized?.name, 'Autumn 2026')
    assert.equal(normalized?.starts_at?.toISOString(), '2026-08-01T00:00:00.000Z')
    assert.equal(normalized?.ends_at, undefined)

    const unexpanded = normalizeCanvasTerm({
      'Canvas.term.id': 'term-1',
      'Canvas.term.name': '$Canvas.term.name',
      'Canvas.term.startAt': '$Canvas.term.startAt',
      'Canvas.term.endAt': '2026-12-31T23:59:59',
    })

    assert.equal(unexpanded?.name, undefined)
    assert.equal(unexpanded?.starts_at, undefined)
    assert.equal(unexpanded?.ends_at, undefined)

    const emptyOrNull = normalizeCanvasTerm({
      'Canvas.term.id': 'term-1',
      'Canvas.term.name': null,
      'Canvas.term.startAt': '   ',
      'Canvas.term.endAt': null,
    })

    assert.equal(emptyOrNull?.name, undefined)
    assert.equal(emptyOrNull?.starts_at, undefined)
    assert.equal(emptyOrNull?.ends_at, undefined)
  })
})

describe('LtiLaunchService.handleLaunch', () => {
  it('resolves scope with the authenticated platform and omits raw Canvas identity', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk: JWK = {
      ...(await exportJWK(publicKey)),
      kid: 'test-key',
      alg: 'RS256',
      use: 'sig',
    }
    const jwks = await startJwksServer(jwk)

    try {
      const issuer = 'https://canvas.launch.test'
      const platform: PlatformRecord = {
        id: uuidv7(),
        issuer,
        name: 'Launch Test Platform',
        client_id: 'launch-client',
        authorization_endpoint: `${issuer}/auth`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: jwks.uri,
        authorization_server: issuer,
      }
      const activityId = uuidv7()
      const activityUrl = 'https://content.launch.test/activity'
      const userId = uuidv7()
      const scopeId = uuidv7()
      const tokens: UserTokens = {
        access: { token: 'access-token', expiration_in_ms: 60_000 },
        refresh: { token: 'refresh-token', expiration_in_ms: 120_000 },
        remember_me: false,
      }
      let resolvedValues: PlatformScopeResolution | undefined

      const service = new LtiLaunchService({
        logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
        tx: {
          withTransaction: async (fn) => await fn(),
        } as TXManager,
        queries: {
          findPlatformByIssuer: async () => platform,
        } as unknown as LtiQueries,
        mutations: {
          claimNonce: async () => true,
          upsertPlatformDeployment: async () => undefined,
          resolvePlatformScope: async (values: PlatformScopeResolution) => {
            resolvedValues = values
            return scopeRecord(values, { id: scopeId, name: 'Autumn 2026' })
          },
        } as unknown as LtiMutations,
        activities: {
          queries: {
            findActivityByURL: async () => ({
              id: activityId,
              url: activityUrl,
              name: null,
              created_at: new Date(),
              updated_at: new Date(),
            }),
          } as unknown as ActivityQueries,
        },
        session: {
          ltiSignInService: {
            signInLti: async () => ({
              user: { id: userId, full_name: 'Test Learner' },
              abilities: [],
              remember_me: false,
            }),
          } as unknown as LtiSignInService,
          tokenIssuer: {
            createTokens: async () => tokens,
          } as unknown as TokenIssuer,
        },
      })

      const rawTermId = 'canvas-term-raw-17'
      const rawStart = '2026-08-20T00:00:00Z'
      const rawEnd = '2026-12-15T23:59:59Z'
      const idToken = await new SignJWT({
        sub: 'canvas-user-1',
        nonce: 'launch-nonce',
        [CLAIM_VERSION]: '1.3.0',
        [CLAIM_DEPLOYMENT_ID]: 'deployment-1',
        [CLAIM_TARGET_LINK_URI]: 'https://gradebook.launch.test/lti/launch',
        [CLAIM_ROLES]: [],
        [CLAIM_CUSTOM]: {
          modulus_launch_type: 'start-activity',
          modulus_activity_code: 'activity-code',
          modulus_activity_url: activityUrl,
          'Canvas.term.id': rawTermId,
          'Canvas.term.name': 'Autumn 2026',
          'Canvas.term.startAt': rawStart,
          'Canvas.term.endAt': rawEnd,
        },
        [CLAIM_MESSAGE_TYPE]: 'LtiResourceLinkRequest',
        [CLAIM_RESOURCE_LINK]: { id: 'resource-link-1' },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer)
        .setAudience(platform.client_id)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)

      const response = await service.handleLaunch({ id_token: idToken, issuer })

      assert.equal(response.type, 'start-activity')
      if (response.type !== 'start-activity') {
        assert.fail('expected a start-activity launch response')
      }
      assert.equal(response.scope_id, scopeId)
      assert.equal(response.scope_name, 'Autumn 2026')
      assert.equal(resolvedValues?.platform_id, platform.id)
      assert.equal(resolvedValues?.external_id, rawTermId)
      assert.equal(resolvedValues?.starts_at?.toISOString(), '2026-08-20T00:00:00.000Z')
      assert.equal(resolvedValues?.ends_at?.toISOString(), '2026-12-15T23:59:59.000Z')
      assert.ok(resolvedValues?.last_verified_launch_at instanceof Date)

      const serialized = JSON.stringify(response)
      assert.equal(serialized.includes(rawTermId), false)
      assert.equal(serialized.includes(rawStart), false)
      assert.equal(serialized.includes(rawEnd), false)
    } finally {
      await jwks.close()
    }
  })
})
