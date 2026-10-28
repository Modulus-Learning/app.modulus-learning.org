/**
 * Characterisation of LTI launch verification and Canvas launch
 * interpretation, pinned before the Canvas and shared-LTI extraction
 * (specs/2026-10-25-canvas-lti-package-extraction-spec.md). These tests record
 * current behaviour; a behaviour change must change them deliberately.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { type JWTPayload, SignJWT } from 'jose'
import { v7 as uuidv7 } from 'uuid'

import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEEP_LINKING_SETTINGS,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_RESOURCE_LINK,
  CLAIM_ROLES,
  CLAIM_TARGET_LINK_URI,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'
import { ErrorCodes } from '@/modules/app/lti/errors.js'
import { LtiLaunchService } from '@/modules/app/lti/services/launch.js'
import {
  createPlatformKeys,
  type PlatformKeys,
  platformRecord,
  silentLogger,
  startJwksServer,
} from '@/test-support/lti.js'
import type { Config } from '@/config.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type { EnrollmentService } from '@/modules/app/activities/services/enrollment.js'
import type {
  LineItemReconciliation,
  LtiMutations,
  LtiQueries,
  PlatformRecord,
} from '@/modules/app/lti/repository/index.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'

const ISSUER = 'https://canvas.characterisation.test'
const ACTIVITY_URL = 'https://activities.characterisation.test/activity'

type Calls = {
  order: string[]
  nonces: string[]
  deployments: Array<[string, string]>
  asInstructor?: boolean
  reconciled?: LineItemReconciliation
  pendingDeepLink?: Record<string, unknown>
}

describe('LTI launch characterisation', () => {
  let keys: PlatformKeys
  let otherKeys: PlatformKeys
  let jwks: Awaited<ReturnType<typeof startJwksServer>>
  let platform: PlatformRecord

  before(async () => {
    keys = await createPlatformKeys()
    otherKeys = await createPlatformKeys()
    jwks = await startJwksServer(keys.jwk)
    platform = platformRecord(ISSUER, { jwks_uri: jwks.uri })
  })

  after(async () => {
    await jwks.close()
  })

  const createService = (options: { platformFound?: boolean; nonceClaimed?: boolean } = {}) => {
    const { platformFound = true, nonceClaimed = true } = options
    const calls: Calls = { order: [], nonces: [], deployments: [] }
    const service = new LtiLaunchService({
      logger: silentLogger(),
      config: { server: { baseUrl: 'https://modulus.characterisation.test' } } as Config,
      tx: { withTransaction: async (fn: () => Promise<unknown>) => await fn() } as TXManager,
      queries: {
        findPlatformByIssuer: async () => (platformFound ? platform : undefined),
        getProgressWithCutoff: async () => 0.5,
      } as unknown as LtiQueries,
      mutations: {
        claimNonce: async (nonce: string) => {
          calls.order.push('claimNonce')
          calls.nonces.push(nonce)
          return nonceClaimed
        },
        upsertPlatformDeployment: async (issuer: string, deploymentId: string) => {
          calls.order.push('upsertPlatformDeployment')
          calls.deployments.push([issuer, deploymentId])
        },
        resolvePlatformScope: async () => ({ id: uuidv7(), name: null }),
        upsertProgress: async () => undefined,
        reconcileLineItem: async (values: LineItemReconciliation) => {
          calls.reconciled = values
        },
        insertPendingDeepLink: async (values: Record<string, unknown>) => {
          calls.pendingDeepLink = values
        },
      } as unknown as LtiMutations,
      activities: {
        queries: {
          findActivityByURL: async () => ({ id: uuidv7(), url: ACTIVITY_URL }),
        } as unknown as ActivityQueries,
        enrollmentService: {
          enrollByPublicActivityCode: async () => ({ status: 'enrolled' }),
        } as unknown as EnrollmentService,
      },
      session: {
        ltiSignInService: {
          signInLti: async (_launch: unknown, asInstructor: boolean) => {
            calls.order.push('signInLti')
            calls.asInstructor = asInstructor
            return { user: { id: uuidv7() }, abilities: [], remember_me: false }
          },
        } as unknown as LtiSignInService,
        tokenIssuer: { createTokens: async () => ({}) } as unknown as TokenIssuer,
      },
    })
    return { service, calls }
  }

  type LaunchOptions = {
    messageType?: string
    launchType?: string
    roles?: string[]
    custom?: Record<string, unknown>
    ags?: boolean
    audience?: string | string[]
    issuer?: string
    key?: CryptoKey
    expiresAt?: number
    extra?: JWTPayload
  }

  const signLaunch = async (options: LaunchOptions = {}) => {
    const {
      messageType = 'LtiResourceLinkRequest',
      launchType = 'start-activity',
      roles = [],
      custom = {},
      ags = true,
      audience = platform.client_id,
      issuer = ISSUER,
      key = keys.privateKey,
      expiresAt,
      extra = {},
    } = options
    const now = Math.floor(Date.now() / 1000)
    return await new SignJWT({
      sub: 'canvas-user-1',
      nonce: 'launch-nonce',
      [CLAIM_VERSION]: '1.3.0',
      [CLAIM_DEPLOYMENT_ID]: 'deployment-1',
      [CLAIM_TARGET_LINK_URI]: 'https://modulus.characterisation.test/routes/lti/launch',
      [CLAIM_ROLES]: roles,
      [CLAIM_MESSAGE_TYPE]: messageType,
      [CLAIM_RESOURCE_LINK]: { id: 'resource-link-1' },
      ...(ags
        ? {
            [CLAIM_AGS_ENDPOINT]: {
              lineitem: `${ISSUER}/lineitems/1`,
              scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
            },
          }
        : {}),
      [CLAIM_CUSTOM]: {
        modulus_launch_type: launchType,
        modulus_activity_code: 'CODE-1',
        modulus_activity_url: ACTIVITY_URL,
        ...custom,
      },
      ...extra,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now - 60)
      .setExpirationTime(expiresAt ?? now + 300)
      .sign(key)
  }

  const rejectsAsInvalidLaunch = async (promise: Promise<unknown>, message: RegExp) => {
    await assert.rejects(promise, (error: unknown) => {
      assert.equal((error as { code?: string }).code, ErrorCodes.INVALID_LAUNCH)
      assert.match((error as Error).message, message)
      return true
    })
  }

  describe('verification', () => {
    it('rejects an issuer with no registered platform before claiming the nonce', async () => {
      const { service, calls } = createService({ platformFound: false })
      await rejectsAsInvalidLaunch(
        service.handleLaunch({ id_token: await signLaunch(), issuer: ISSUER }),
        /platform not found/
      )
      assert.deepEqual(calls.order, [])
    })

    it('rejects a token not signed by the platform key', async () => {
      const { service, calls } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({ key: otherKeys.privateKey }),
          issuer: ISSUER,
        }),
        /verification failed/
      )
      assert.deepEqual(calls.order, [])
    })

    it('rejects a token whose iss differs from the requested issuer', async () => {
      const { service } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({ issuer: 'https://other.characterisation.test' }),
          issuer: ISSUER,
        }),
        /verification failed/
      )
    })

    it('accepts an audience array that contains the client id', async () => {
      const { service } = createService()
      const response = await service.handleLaunch({
        id_token: await signLaunch({ audience: ['someone-else', platform.client_id] }),
        issuer: ISSUER,
      })
      assert.equal(response.type, 'start-activity')
    })

    it('rejects an audience that does not name the client id', async () => {
      for (const audience of ['someone-else', ['someone-else', 'another']]) {
        const { service, calls } = createService()
        await rejectsAsInvalidLaunch(
          service.handleLaunch({ id_token: await signLaunch({ audience }), issuer: ISSUER }),
          /incorrect audience/
        )
        assert.deepEqual(calls.order, [])
      }
    })

    it('does not check azp when the audience has several values (current gap)', async () => {
      const { service } = createService()
      const response = await service.handleLaunch({
        id_token: await signLaunch({
          audience: [platform.client_id, 'someone-else'],
          extra: { azp: 'someone-else' },
        }),
        issuer: ISSUER,
      })
      assert.equal(response.type, 'start-activity')
    })

    it('accepts a token expired less than ten minutes ago (clock tolerance)', async () => {
      const { service } = createService()
      const response = await service.handleLaunch({
        id_token: await signLaunch({ expiresAt: Math.floor(Date.now() / 1000) - 5 * 60 }),
        issuer: ISSUER,
      })
      assert.equal(response.type, 'start-activity')
    })

    it('rejects a token expired more than ten minutes ago', async () => {
      const { service } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({ expiresAt: Math.floor(Date.now() / 1000) - 15 * 60 }),
          issuer: ISSUER,
        }),
        /verification failed/
      )
    })

    it('rejects a replayed nonce and writes no deployment', async () => {
      const { service, calls } = createService({ nonceClaimed: false })
      await rejectsAsInvalidLaunch(
        service.handleLaunch({ id_token: await signLaunch(), issuer: ISSUER }),
        /nonce invalid or already used/
      )
      assert.deepEqual(calls.order, ['claimNonce'])
      assert.deepEqual(calls.nonces, ['launch-nonce'])
    })

    it('claims the nonce, then upserts the deployment, inside verification', async () => {
      const { service, calls } = createService()
      await service.handleLaunch({ id_token: await signLaunch(), issuer: ISSUER })
      assert.deepEqual(calls.order.slice(0, 3), [
        'claimNonce',
        'upsertPlatformDeployment',
        'signInLti',
      ])
      assert.deepEqual(calls.deployments, [[ISSUER, 'deployment-1']])
    })
  })

  describe('message dispatch', () => {
    it('serves view-dashboard resource-link launches', async () => {
      const { service } = createService()
      const response = await service.handleLaunch({
        id_token: await signLaunch({ launchType: 'view-dashboard', ags: false }),
        issuer: ISSUER,
      })
      assert.equal(response.type, 'view-dashboard')
    })

    it('rejects a start-activity launch carried by a deep-linking message', async () => {
      const { service } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({
            messageType: 'LtiDeepLinkingRequest',
            extra: {
              [CLAIM_DEEP_LINKING_SETTINGS]: {
                deep_link_return_url: `${ISSUER}/deep-link-return`,
                accept_types: ['ltiResourceLink'],
                accept_presentation_document_targets: ['iframe'],
              },
            },
          }),
          issuer: ISSUER,
        }),
        /unknown launch type/
      )
    })

    it('rejects an unknown modulus_launch_type', async () => {
      const { service } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({ launchType: 'something-else' }),
          issuer: ISSUER,
        }),
        /unknown launch type/
      )
    })
  })

  describe('Canvas role interpretation', () => {
    const instructorRoles = [
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#SysAdmin',
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
    ]

    for (const role of instructorRoles) {
      it(`signs in as an instructor for ${role.split('/').at(-1)}`, async () => {
        const { service, calls } = createService()
        await service.handleLaunch({
          id_token: await signLaunch({ roles: [role] }),
          issuer: ISSUER,
        })
        assert.equal(calls.asInstructor, true)
      })
    }

    for (const roles of [
      [],
      ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
      ['http://purl.imsglobal.org/vocab/lis/v2/system/person#TestUser'],
      ['http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator'],
      ['Instructor'],
    ]) {
      it(`signs in as a learner for [${roles.map((r) => r.split('/').at(-1)).join(', ')}]`, async () => {
        const { service, calls } = createService()
        await service.handleLaunch({ id_token: await signLaunch({ roles }), issuer: ISSUER })
        assert.equal(calls.asInstructor, false)
      })
    }
  })

  describe('cutoff precedence', () => {
    const cutoffFor = async (custom: Record<string, unknown>) => {
      const { service, calls } = createService()
      await service.handleLaunch({ id_token: await signLaunch({ custom }), issuer: ISSUER })
      return calls.reconciled?.cutoff_at
    }

    it('prefers a usable ResourceLink.available.endDateTime', async () => {
      const cutoff = await cutoffFor({
        'ResourceLink.available.endDateTime': '2026-12-01T12:00:00Z',
        'Canvas.assignment.lockAt.iso8601': '2026-11-01T12:00:00Z',
      })
      assert.equal(cutoff?.toISOString(), '2026-12-01T12:00:00.000Z')
    })

    it('falls back to Canvas lockAt when the standard value is unexpanded', async () => {
      const cutoff = await cutoffFor({
        'ResourceLink.available.endDateTime': '$ResourceLink.available.endDateTime',
        'Canvas.assignment.lockAt.iso8601': '2026-11-01T12:00:00Z',
      })
      assert.equal(cutoff?.toISOString(), '2026-11-01T12:00:00.000Z')
    })

    it('falls back to Canvas lockAt when the standard value is missing or null', async () => {
      for (const standard of [undefined, null]) {
        const cutoff = await cutoffFor({
          ...(standard === undefined ? {} : { 'ResourceLink.available.endDateTime': standard }),
          'Canvas.assignment.lockAt.iso8601': '2026-11-01T12:00:00Z',
        })
        assert.equal(cutoff?.toISOString(), '2026-11-01T12:00:00.000Z')
      }
    })

    it('rejects the whole launch when a custom claim is not a string, boolean or null', async () => {
      const { service } = createService()
      await rejectsAsInvalidLaunch(
        service.handleLaunch({
          id_token: await signLaunch({ custom: { 'ResourceLink.available.endDateTime': 42 } }),
          issuer: ISSUER,
        }),
        /failed basic validation/
      )
    })

    it('has no cutoff when neither value parses', async () => {
      const cutoff = await cutoffFor({
        'ResourceLink.available.endDateTime': '',
        'Canvas.assignment.lockAt.iso8601': '$Canvas.assignment.lockAt.iso8601',
      })
      assert.equal(cutoff, undefined)
    })

    it('accepts any Date.parse-able string, not only ISO 8601 with an offset', async () => {
      const cutoff = await cutoffFor({ 'ResourceLink.available.endDateTime': '2026-12-01' })
      assert.equal(cutoff?.toISOString(), '2026-12-01T00:00:00.000Z')
    })
  })
})
