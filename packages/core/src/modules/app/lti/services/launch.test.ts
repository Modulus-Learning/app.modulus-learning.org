import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'

import type { JWK } from 'jose'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { createCoreLogger } from '@/lib/logger.js'
import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_RESOURCE_LINK,
  CLAIM_ROLES,
  CLAIM_TARGET_LINK_URI,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'
import { ErrorCodes } from '@/modules/app/lti/errors.js'
import {
  LtiLaunchService,
  normalizeCanvasTerm,
  resolveVerifiedLaunchScope,
} from '@/modules/app/lti/services/launch.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type {
  EnrollmentOutcome,
  EnrollmentService,
} from '@/modules/app/activities/services/enrollment.js'
import type {
  LineItemReconciliation,
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

  it('logs privacy-safe fallback and optional metadata quality diagnostics', async () => {
    const diagnostics: unknown[] = []
    const rawTermId = 'must-not-appear-in-logs'

    const result = await resolveVerifiedLaunchScope(
      {
        resolvePlatformScope: async (values) => scopeRecord(values),
      },
      uuidv7(),
      {
        'Canvas.term.id': '$Canvas.term.id',
        'Canvas.term.name': '  ',
        'Canvas.term.startAt': 'not-a-date',
        'Canvas.term.endAt': '$Canvas.term.endAt',
        unrelated: rawTermId,
      },
      {
        logger: {
          info: (...args) => diagnostics.push(args),
        },
      }
    )

    assert.deepEqual(result, { scope_id: DEFAULT_SCOPE_ID, scope_name: null })
    assert.deepEqual(diagnostics, [
      [
        {
          scope_id: DEFAULT_SCOPE_ID,
          source: 'default',
          quality: {
            term_id: 'unexpanded',
            name: 'empty',
            starts_at: 'malformed',
            ends_at: 'unexpanded',
          },
        },
        'activity scope resolved',
      ],
    ])
    assert.equal(JSON.stringify(diagnostics).includes(rawTermId), false)
  })

  it('resolves an id-only term and returns only canonical activity-facing metadata', async () => {
    const platformId = uuidv7()
    const scopeId = uuidv7()
    const verifiedAt = new Date('2026-08-05T10:00:00Z')
    const rawTermId = 'raw-canvas-term-identity-never-log'
    const calls: PlatformScopeResolution[] = []
    const diagnostics: unknown[] = []

    const result = await resolveVerifiedLaunchScope(
      {
        resolvePlatformScope: async (values) => {
          calls.push(values)
          return scopeRecord(values, { id: scopeId })
        },
      },
      platformId,
      { 'Canvas.term.id': ` ${rawTermId} ` },
      {
        verified_at: verifiedAt,
        logger: {
          info: (...args) => diagnostics.push(args),
        },
      }
    )

    assert.deepEqual(calls, [
      {
        platform_id: platformId,
        external_id: rawTermId,
        name: undefined,
        starts_at: undefined,
        ends_at: undefined,
        last_verified_launch_at: verifiedAt,
      },
    ])
    assert.deepEqual(result, { scope_id: scopeId, scope_name: null })
    assert.deepEqual(Object.keys(result).sort(), ['scope_id', 'scope_name'])
    assert.deepEqual(diagnostics, [
      [
        {
          scope_id: scopeId,
          source: 'platform',
          quality: {
            term_id: 'usable',
            name: 'missing',
            starts_at: 'missing',
            ends_at: 'missing',
          },
        },
        'activity scope resolved',
      ],
    ])
    assert.equal(JSON.stringify(diagnostics).includes(rawTermId), false)
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

type LaunchRecorders = {
  resolvedValues?: PlatformScopeResolution
  initializedScope?: string
  cutoffScope?: string
  reconciled?: LineItemReconciliation
  enrollments: { user_id: string; activity_code: string; activity_id: string }[]
  /** Whether sign-in was told the launching user holds an instructor role. */
  signedInAsInstructor?: boolean
  /** Every recorded step, in the order it ran, so ordering can be asserted. */
  order: string[]
}

type ServiceOptions = {
  /** Outcome the enrollment-service fake returns. Defaults to `enrolled`. */
  enrollmentOutcome?: EnrollmentOutcome
  /** When set, `withTransaction` rejects with this error. */
  transactionError?: Error
  /** When false, `findActivityByURL` resolves to undefined. */
  activityExists?: boolean
  /**
   * The `url` on the resolved `activities` row. Defaults to the launched URL,
   * which is what a real `findActivityByURL` match guarantees; a test sets it
   * apart only to observe which of the two the response carries.
   */
  canonicalActivityUrl?: string
}

const ACTIVITY_URL = 'https://content.launch.test/activity'
const ACTIVITY_CODE = 'activity-code'
const RAW_TERM_ID = 'canvas-term-raw-17'
const RAW_START = '2026-08-20T00:00:00Z'
const RAW_END = '2026-12-15T23:59:59Z'

describe('LtiLaunchService.handleLaunch', () => {
  let jwks: Awaited<ReturnType<typeof startJwksServer>>
  let privateKey: CryptoKey
  let platform: PlatformRecord

  const issuer = 'https://canvas.launch.test'

  before(async () => {
    const keyPair = await generateKeyPair('RS256')
    privateKey = keyPair.privateKey
    const jwk: JWK = {
      ...(await exportJWK(keyPair.publicKey)),
      kid: 'test-key',
      alg: 'RS256',
      use: 'sig',
    }
    jwks = await startJwksServer(jwk)
    platform = {
      id: uuidv7(),
      issuer,
      name: 'Launch Test Platform',
      client_id: 'launch-client',
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: jwks.uri,
      authorization_server: issuer,
    }
  })

  after(async () => {
    await jwks.close()
  })

  const createService = (options: ServiceOptions = {}) => {
    const {
      enrollmentOutcome,
      transactionError,
      activityExists = true,
      canonicalActivityUrl = ACTIVITY_URL,
    } = options
    const activityId = uuidv7()
    const userId = uuidv7()
    const scopeId = uuidv7()
    const tokens: UserTokens = {
      access: { token: 'access-token', expiration_in_ms: 60_000 },
      refresh: { token: 'refresh-token', expiration_in_ms: 120_000 },
      remember_me: false,
    }
    const recorders: LaunchRecorders = { enrollments: [], order: [] }

    const service = new LtiLaunchService({
      logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }),
      tx: {
        withTransaction: async (fn) => {
          recorders.order.push('transaction')
          if (transactionError != null) {
            throw transactionError
          }
          return await fn()
        },
      } as TXManager,
      queries: {
        findPlatformByIssuer: async () => platform,
        getProgressWithCutoff: async (_userId: string, _activityId: string, scope: string) => {
          recorders.cutoffScope = scope
          return 0.35
        },
      } as unknown as LtiQueries,
      mutations: {
        claimNonce: async () => true,
        upsertPlatformDeployment: async () => undefined,
        resolvePlatformScope: async (values: PlatformScopeResolution) => {
          recorders.resolvedValues = values
          return scopeRecord(values, { id: scopeId, name: 'Autumn 2026' })
        },
        upsertProgress: async (_activityId: string, _userId: string, scope: string) => {
          recorders.initializedScope = scope
        },
        reconcileLineItem: async (values: LineItemReconciliation) => {
          recorders.reconciled = values
        },
      } as unknown as LtiMutations,
      activities: {
        queries: {
          findActivityByURL: async () =>
            activityExists
              ? {
                  id: activityId,
                  url: canonicalActivityUrl,
                  name: null,
                  created_at: new Date(),
                  updated_at: new Date(),
                }
              : undefined,
        } as unknown as ActivityQueries,
        enrollmentService: {
          enrollByActivityCodeId: async (): Promise<EnrollmentOutcome> => {
            throw new Error('the LTI launch must enroll by public activity code')
          },
          enrollByPublicActivityCode: async (params: {
            user_id: string
            activity_code: string
            activity_id: string
          }): Promise<EnrollmentOutcome> => {
            recorders.order.push('enrollment')
            recorders.enrollments.push(params)
            return enrollmentOutcome ?? { status: 'enrolled', activity_code_id: uuidv7() }
          },
        } as unknown as EnrollmentService,
      },
      session: {
        ltiSignInService: {
          signInLti: async (_launch: unknown, asInstructor: boolean) => {
            recorders.signedInAsInstructor = asInstructor
            return {
              user: { id: userId, full_name: 'Test Learner' },
              abilities: [],
              remember_me: false,
            }
          },
        } as unknown as LtiSignInService,
        tokenIssuer: {
          createTokens: async () => tokens,
        } as unknown as TokenIssuer,
      },
    })

    return { service, recorders, activityId, userId, scopeId }
  }

  const signLaunch = async ({
    ags = true,
    roles = [] as string[],
    activityCode = ACTIVITY_CODE,
  } = {}) =>
    await new SignJWT({
      sub: 'canvas-user-1',
      nonce: 'launch-nonce',
      [CLAIM_VERSION]: '1.3.0',
      [CLAIM_DEPLOYMENT_ID]: 'deployment-1',
      [CLAIM_TARGET_LINK_URI]: 'https://gradebook.launch.test/lti/launch',
      [CLAIM_ROLES]: roles,
      ...(ags
        ? {
            [CLAIM_AGS_ENDPOINT]: {
              lineitem: 'https://canvas.launch.test/lineitems/1',
              scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
            },
          }
        : {}),
      [CLAIM_CUSTOM]: {
        modulus_launch_type: 'start-activity',
        modulus_activity_code: activityCode,
        modulus_activity_url: ACTIVITY_URL,
        'Canvas.term.id': RAW_TERM_ID,
        'Canvas.term.name': 'Autumn 2026',
        'Canvas.term.startAt': RAW_START,
        'Canvas.term.endAt': RAW_END,
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

  it('resolves scope with the authenticated platform and omits raw Canvas identity', async () => {
    const { service, recorders, scopeId } = createService()

    const response = await service.handleLaunch({
      id_token: await signLaunch(),
      issuer,
    })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.scope_id, scopeId)
    assert.equal(response.scope_name, 'Autumn 2026')
    assert.equal(recorders.resolvedValues?.platform_id, platform.id)
    assert.equal(recorders.resolvedValues?.external_id, RAW_TERM_ID)
    assert.equal(recorders.resolvedValues?.starts_at?.toISOString(), '2026-08-20T00:00:00.000Z')
    assert.equal(recorders.resolvedValues?.ends_at?.toISOString(), '2026-12-15T23:59:59.000Z')
    assert.ok(recorders.resolvedValues?.last_verified_launch_at instanceof Date)
    assert.equal(recorders.initializedScope, scopeId)
    assert.equal(recorders.cutoffScope, scopeId)
    assert.equal(recorders.reconciled?.scope_id, scopeId)
    assert.equal(recorders.reconciled?.submittable_progress, 0.35)

    const serialized = JSON.stringify(response)
    assert.equal(serialized.includes(RAW_TERM_ID), false)
    assert.equal(serialized.includes(RAW_START), false)
    assert.equal(serialized.includes(RAW_END), false)
  })

  it('enrolls an AGS launch and still reconciles the line item', async () => {
    const { service, recorders, activityId, userId, scopeId } = createService()

    await service.handleLaunch({ id_token: await signLaunch(), issuer })

    assert.equal(recorders.signedInAsInstructor, false)
    assert.deepEqual(recorders.enrollments, [
      { user_id: userId, activity_code: ACTIVITY_CODE, activity_id: activityId },
    ])
    assert.equal(recorders.reconciled?.scope_id, scopeId)
  })

  it('enrolls an instructor resource-link launch under current policy', async () => {
    const { service, recorders, activityId, userId } = createService()

    await service.handleLaunch({
      id_token: await signLaunch({
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      }),
      issuer,
    })

    // The launch really did take the instructor path ...
    assert.equal(recorders.signedInAsInstructor, true)
    // ... and current policy makes no role distinction: an instructor launch
    // performs the same enrollment attempt as a learner launch.
    assert.deepEqual(recorders.enrollments, [
      { user_id: userId, activity_code: ACTIVITY_CODE, activity_id: activityId },
    ])
  })

  it('enrolls a launch with no AGS endpoint and performs no transaction', async () => {
    const { service, recorders, activityId, userId, scopeId } = createService()

    const response = await service.handleLaunch({
      id_token: await signLaunch({ ags: false }),
      issuer,
    })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.scope_id, scopeId)
    assert.deepEqual(recorders.enrollments, [
      { user_id: userId, activity_code: ACTIVITY_CODE, activity_id: activityId },
    ])
    assert.deepEqual(recorders.order, ['enrollment'])
    assert.equal(recorders.reconciled, undefined)
  })

  it('records the enrollment before the AGS transaction runs', async () => {
    const { service, recorders } = createService()

    await service.handleLaunch({ id_token: await signLaunch(), issuer })

    assert.deepEqual(recorders.order, ['enrollment', 'transaction'])
  })

  it('leaves the enrollment in place when the AGS transaction rejects', async () => {
    const transactionError = new Error('line item reconciliation failed')
    const { service, recorders, activityId, userId } = createService({ transactionError })

    await assert.rejects(
      service.handleLaunch({ id_token: await signLaunch(), issuer }),
      transactionError
    )

    // The enrollment write is not inside the rolled-back unit of work.
    assert.deepEqual(recorders.enrollments, [
      { user_id: userId, activity_code: ACTIVITY_CODE, activity_id: activityId },
    ])
    assert.deepEqual(recorders.order, ['enrollment', 'transaction'])
  })

  it('honours the launch when the public activity code does not resolve', async () => {
    const { service, recorders, scopeId, activityId } = createService({
      enrollmentOutcome: { status: 'skipped', reason: 'unknown_activity_code' },
    })

    const response = await service.handleLaunch({
      id_token: await signLaunch({ activityCode: 'retired-code' }),
      issuer,
    })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.activity_code, 'retired-code')
    assert.equal(response.scope_id, scopeId)
    assert.equal(response.scope_name, 'Autumn 2026')
    assert.equal(response.tokens.access.token, 'access-token')
    assert.equal(recorders.enrollments.length, 1)

    // The response still carries everything the launch route needs to build a
    // destination, so a code that no longer resolves cannot strand the learner.
    assert.equal(response.activity_id, activityId)
    assert.equal(response.activity_url, ACTIVITY_URL)
  })

  it('honours the launch when the activity is no longer associated with the code', async () => {
    const { service, recorders, scopeId } = createService({
      enrollmentOutcome: { status: 'skipped', reason: 'activity_not_in_activity_code' },
    })

    const response = await service.handleLaunch({ id_token: await signLaunch(), issuer })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.activity_code, ACTIVITY_CODE)
    assert.equal(response.scope_id, scopeId)
    assert.equal(response.tokens.refresh.token, 'refresh-token')
    assert.equal(recorders.reconciled?.scope_id, scopeId)
    assert.equal(recorders.enrollments.length, 1)
  })

  it('still rejects an activity URL that resolves to no activity', async () => {
    const { service, recorders } = createService({ activityExists: false })

    await assert.rejects(
      service.handleLaunch({ id_token: await signLaunch(), issuer }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.INVALID_LAUNCH)
        return true
      }
    )
    assert.deepEqual(recorders.enrollments, [])
  })

  it('carries the resolved activity id in the launch response', async () => {
    const { service, activityId } = createService()

    const response = await service.handleLaunch({ id_token: await signLaunch(), issuer })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.activity_id, activityId)
  })

  it('carries the activities row URL rather than the launched claim', async () => {
    // The two agree in production -- `findActivityByURL` matched the claim on
    // that exact value -- so they are set apart here only to observe which one
    // the response carries. The database row is the authority.
    const canonicalActivityUrl = 'https://content.launch.test/canonical?authored=one#section'
    const { service } = createService({ canonicalActivityUrl })

    const response = await service.handleLaunch({ id_token: await signLaunch(), issuer })

    assert.equal(response.type, 'start-activity')
    if (response.type !== 'start-activity') {
      assert.fail('expected a start-activity launch response')
    }
    assert.equal(response.activity_url, canonicalActivityUrl)
    assert.notEqual(response.activity_url, ACTIVITY_URL)
  })

  it('carries no raw Canvas term identity into the response or the enrollment call', async () => {
    const { service, recorders } = createService()

    const response = await service.handleLaunch({ id_token: await signLaunch(), issuer })

    const serialized = JSON.stringify({
      response,
      enrollments: recorders.enrollments,
    })
    for (const value of [RAW_TERM_ID, RAW_START, RAW_END, 'canvas-user-1']) {
      assert.equal(serialized.includes(value), false, `launch leaked ${value}`)
    }
  })
})
