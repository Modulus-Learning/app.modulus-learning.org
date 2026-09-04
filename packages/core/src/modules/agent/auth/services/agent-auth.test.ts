import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { ErrorCodes } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { parseAdmissibleUrl } from '@/modules/activity-registration/url-policy.js'
import { claimAuthCodeSchemas, createAuthCodeSchemas } from '../schemas.js'
import { accessTokenPayloadSchema } from '../types.js'
import { AgentAuthService } from './agent-auth.js'
import { AgentTokenIssuer } from './token-issuer.js'
import type { Config } from '@/config.js'
import type { CoreError } from '@/lib/errors.js'
import type { JWTSigner } from '@/lib/jwt/services.js'
import type { PolicySnapshot } from '@/modules/activity-registration/schemas.js'
import type {
  ActivityRegistrationService,
  RegistrationOutcome,
} from '@/modules/activity-registration/services/activity-registration.js'
import type {
  ActivityRecord,
  AgentAuthMutations,
  AgentAuthQueries,
  AuthCodeInsert,
  AuthCodeRecord,
  ScopeRecord,
  UserRecord,
} from '../repository/index.js'
import type { SignInResult } from '../types.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const makeRecords = (scopeName: string | null = 'Autumn 2026') => {
  const user = {
    id: uuidv7(),
    full_name: 'Test Learner',
    is_enabled: true,
  } as UserRecord
  const activity = {
    id: uuidv7(),
    url: 'https://content.test/activity',
  } as ActivityRecord
  const scope = {
    id: uuidv7(),
    platform_id: uuidv7(),
    external_id: 'term-1',
    name: scopeName,
  } as ScopeRecord

  return { user, activity, scope }
}

const makeService = ({
  claimedCode,
  scopeExists = true,
  activityExists = true,
  activityCreateReturnsRecord = true,
  allowedOrigins = ['https://content.test'],
}: {
  claimedCode?: AuthCodeRecord
  scopeExists?: boolean
  activityExists?: boolean
  activityCreateReturnsRecord?: boolean
  /** The enabled policy. Empty denies every unseen redirect URI. */
  allowedOrigins?: string[]
} = {}) => {
  const records = makeRecords()
  const inserted: AuthCodeInsert[] = []
  const createdActivityUrls: string[] = []
  let issued: SignInResult | undefined

  /**
   * Mirrors `ActivityRegistrationService`, including its order: a known
   * activity resolves with no policy evaluation, the column bound is checked
   * before the policy, and a conflicting insert still resolves to a row.
   */
  const registration = {
    loadPolicy: async (): Promise<PolicySnapshot> => ({
      rules: allowedOrigins.map((origin) => ({ origin, path_prefix: '/' })),
    }),
    register: async (url: string, policy: PolicySnapshot): Promise<RegistrationOutcome> => {
      if (activityExists) {
        return { ok: true, activity: records.activity }
      }

      if (url.length > 255) {
        return { ok: false, url, reason: 'url_too_long' }
      }

      const candidate = parseAdmissibleUrl(url)
      if (candidate === null) {
        return { ok: false, url, reason: 'malformed_url' }
      }
      if (!policy.rules.some((rule) => rule.origin === candidate.origin)) {
        return { ok: false, url, reason: 'activity_url_not_allowed' }
      }

      createdActivityUrls.push(url)
      // `activityCreateReturnsRecord: false` models a concurrent create
      // winning: the insert conflicts and `register` re-reads the winner, so
      // the outcome is still a success carrying a row.
      return { ok: true, activity: records.activity }
    },
  } as unknown as ActivityRegistrationService

  const service = new AgentAuthService({
    logger,
    config: { server: { baseUrl: 'https://gradebook.test' } } as Config,
    queries: {
      findActivityByUrl: async () => (activityExists ? records.activity : undefined),
      findScopeById: async (id: string) =>
        scopeExists && id === records.scope.id ? records.scope : undefined,
      getUser: async () => records.user,
    } as unknown as AgentAuthQueries,
    mutations: {
      createActivity: async (url: string) => {
        createdActivityUrls.push(url)
        return activityCreateReturnsRecord ? records.activity : undefined
      },
      createAuthCode: async (data: AuthCodeInsert) => {
        inserted.push(data)
      },
      claimAuthCode: async () => claimedCode,
    } as unknown as AgentAuthMutations,
    tokenIssuer: {
      createAccessToken: async (result: SignInResult) => {
        issued = result
        return 'signed-agent-token'
      },
    } as AgentTokenIssuer,
    activityRegistration: { service: registration },
  })

  return { service, inserted, createdActivityUrls, getIssued: () => issued, ...records }
}

describe('AgentAuthService scope binding', () => {
  it('rejects malformed scope ids at the command boundary', () => {
    const parsed = createAuthCodeSchemas.input.safeParse({
      client_id: 'https://content.test/activity',
      redirect_uri: 'https://content.test/activity',
      code_challenge: 'challenge',
      scope_id: 'not-a-uuid',
    })

    assert.equal(parsed.success, false)
  })

  it('rejects an unknown scope without creating an authorization code', async () => {
    const { service, inserted, createdActivityUrls, user, activity, scope } = makeService({
      scopeExists: false,
      activityExists: false,
    })

    await assert.rejects(
      service.createAuthCode(new UserAuth(user.id, []), {
        client_id: activity.url,
        redirect_uri: activity.url,
        code_challenge: 'challenge',
        scope_id: scope.id,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, ErrorCodes.VALIDATION)
        return true
      }
    )
    assert.deepEqual(inserted, [])
    assert.deepEqual(createdActivityUrls, [])
  })

  it('stores any existing selected scope on the single-use code', async () => {
    const { service, inserted, createdActivityUrls, user, activity, scope } = makeService()

    await service.createAuthCode(new UserAuth(user.id, []), {
      client_id: activity.url,
      redirect_uri: activity.url,
      code_challenge: 'challenge',
      scope_id: scope.id,
    })

    assert.equal(inserted.length, 1)
    assert.equal(inserted[0]?.scope_id, scope.id)
    assert.deepEqual(createdActivityUrls, [])
  })

  it('creates an unknown activity before issuing an authorization code', async () => {
    const { service, inserted, createdActivityUrls, user, activity, scope } = makeService({
      activityExists: false,
    })

    await service.createAuthCode(new UserAuth(user.id, []), {
      client_id: activity.url,
      redirect_uri: activity.url,
      code_challenge: 'challenge',
      scope_id: scope.id,
    })

    assert.deepEqual(createdActivityUrls, [activity.url])
    assert.equal(inserted.length, 1)
  })

  it('issues an authorization code when another request wins the activity create race', async () => {
    const { service, inserted, user, activity, scope } = makeService({
      activityExists: false,
      activityCreateReturnsRecord: false,
    })

    await service.createAuthCode(new UserAuth(user.id, []), {
      client_id: activity.url,
      redirect_uri: activity.url,
      code_challenge: 'challenge',
      scope_id: scope.id,
    })

    assert.equal(inserted.length, 1)
  })

  it('uses only the claimed code scope for token identity and canonical display metadata', async () => {
    const records = makeRecords()
    const codeVerifier = 'verifier'
    const codeChallenge = createHash('sha256')
      .update(codeVerifier, 'utf8')
      .digest()
      .toString('base64url')
    const claimedCode = {
      code: 'one-time-code',
      user_id: records.user.id,
      scope_id: records.scope.id,
      client_id: records.activity.url,
      redirect_uri: records.activity.url,
      code_challenge: codeChallenge,
      expires_at: new Date(Date.now() + 60_000),
    } satisfies AuthCodeRecord
    const inserted: AuthCodeInsert[] = []
    let issued: SignInResult | undefined
    const service = new AgentAuthService({
      logger,
      config: { server: { baseUrl: 'https://gradebook.test' } } as Config,
      queries: {
        findActivityByUrl: async () => records.activity,
        findScopeById: async () => records.scope,
        getUser: async () => records.user,
      } as unknown as AgentAuthQueries,
      mutations: {
        createAuthCode: async (data: AuthCodeInsert) => inserted.push(data),
        claimAuthCode: async () => claimedCode,
      } as unknown as AgentAuthMutations,
      tokenIssuer: {
        createAccessToken: async (result: SignInResult) => {
          issued = result
          return 'signed-agent-token'
        },
      } as AgentTokenIssuer,
      // `claimAuthCode` consults no policy, so this would fail loudly if it
      // ever started to.
      activityRegistration: {
        service: {
          loadPolicy: async () => {
            throw new Error('claimAuthCode must not load the allowlist policy')
          },
          register: async () => {
            throw new Error('claimAuthCode must not register an activity')
          },
        } as unknown as ActivityRegistrationService,
      },
    })

    const request = claimAuthCodeSchemas.input.parse({
      code: claimedCode.code,
      client_id: claimedCode.client_id,
      redirect_uri: claimedCode.redirect_uri,
      code_verifier: codeVerifier,
      scope_id: uuidv7(),
    })
    assert.equal('scope_id' in request, false)

    const result = await service.claimAuthCode(request)

    assert.equal(issued?.scope_id, records.scope.id)
    assert.equal(result.scope_id, records.scope.id)
    assert.equal(result.scope_name, 'Autumn 2026')
    assert.equal(result.access_token, 'signed-agent-token')
  })

  it('signs scope id, but never scope name, into the access-token payload', async () => {
    const { user, activity, scope } = makeRecords()
    let signedPayload: Record<string, unknown> | undefined
    const issuer = new AgentTokenIssuer({
      jwtSign: {
        sign: async (payload: Record<string, unknown>, type: string) => {
          signedPayload = payload
          assert.equal(type, 'agent')
          return { token: 'jwt', expiration_in_ms: Date.now() + 60_000 }
        },
      } as unknown as JWTSigner,
      config: { jwt: { agent: { renewAfterSeconds: 60 } } } as Config,
    })

    await issuer.createAccessToken({ user, activity, scope_id: scope.id })

    assert.equal(signedPayload?.scope_id, scope.id)
    assert.equal('scope_name' in (signedPayload ?? {}), false)
    assert.equal(accessTokenPayloadSchema.safeParse(signedPayload).success, true)
  })

  it('accepts the default sentinel as a normal existing scope', () => {
    const parsed = createAuthCodeSchemas.input.safeParse({
      client_id: 'https://content.test/activity',
      redirect_uri: 'https://content.test/activity',
      code_challenge: 'challenge',
      scope_id: DEFAULT_SCOPE_ID,
    })

    assert.equal(parsed.success, true)
  })
})

describe('AgentAuthService activity url allowlist', () => {
  it('refuses a disallowed unseen redirect uri, creating no activity and no auth code', async () => {
    // Two separate obligations: no activity *and* no authorization code. A
    // learner's page can name any redirect URI it likes, and without this gate
    // every one of them became a registered activity.
    const { service, inserted, createdActivityUrls, user, scope } = makeService({
      activityExists: false,
      allowedOrigins: ['https://content.test'],
    })
    const redirect_uri = 'https://elsewhere.test/activity'

    await assert.rejects(
      service.createAuthCode(new UserAuth(user.id, []), {
        client_id: redirect_uri,
        redirect_uri,
        code_challenge: 'challenge',
        scope_id: scope.id,
      }),
      (error: CoreError) => {
        assert.equal(error.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
        assert.deepEqual(error.details, {
          rejected: [{ url: redirect_uri, reason: 'activity_url_not_allowed' }],
        })
        return true
      }
    )

    assert.deepEqual(createdActivityUrls, [])
    assert.deepEqual(inserted, [])
  })

  it('issues a code for a known grandfathered redirect uri under an empty policy', async () => {
    // Ordinary use of an already-admitted activity is never re-checked, so a
    // learner mid-course is unaffected by an administrator editing the policy.
    const { service, inserted, createdActivityUrls, user, activity, scope } = makeService({
      activityExists: true,
      allowedOrigins: [],
    })

    await service.createAuthCode(new UserAuth(user.id, []), {
      client_id: activity.url,
      redirect_uri: activity.url,
      code_challenge: 'challenge',
      scope_id: scope.id,
    })

    assert.equal(inserted.length, 1)
    assert.deepEqual(createdActivityUrls, [])
  })

  it('rejects an over-long redirect uri rather than letting the database fail', async () => {
    // `redirect_uri` is an unbounded `z.string()` at the command boundary;
    // `register` bounds it at the `activities.url` column width and reports it
    // as a denial reason instead of surfacing a database error.
    const { service, inserted, createdActivityUrls, user, scope } = makeService({
      activityExists: false,
      allowedOrigins: ['https://content.test'],
    })
    const redirect_uri = `https://content.test/${'a'.repeat(256)}`

    await assert.rejects(
      service.createAuthCode(new UserAuth(user.id, []), {
        client_id: redirect_uri,
        redirect_uri,
        code_challenge: 'challenge',
        scope_id: scope.id,
      }),
      (error: CoreError) => {
        assert.equal(error.code, 'ERR_ACTIVITY_URL_NOT_ALLOWED')
        assert.deepEqual(error.details, {
          rejected: [{ url: redirect_uri, reason: 'url_too_long' }],
        })
        return true
      }
    )

    assert.deepEqual(createdActivityUrls, [])
    assert.deepEqual(inserted, [])
  })

  it('does not re-check the policy at token exchange (characterization guard)', async () => {
    // This proves nothing about today: `claimAuthCode` consults no policy, and
    // the assertion exists to fail loudly if someone later adds a call there.
    // A rule removed between authorization and token exchange must not revoke
    // an admission the learner already holds -- they would be stranded
    // mid-activity with a code they cannot exchange.
    const records = makeRecords()
    const codeVerifier = 'verifier'
    const codeChallenge = createHash('sha256')
      .update(codeVerifier, 'utf8')
      .digest()
      .toString('base64url')
    const claimedCode = {
      code: 'one-time-code',
      user_id: records.user.id,
      scope_id: records.scope.id,
      client_id: records.activity.url,
      redirect_uri: records.activity.url,
      code_challenge: codeChallenge,
      expires_at: new Date(Date.now() + 60_000),
    } satisfies AuthCodeRecord

    const service = new AgentAuthService({
      logger,
      config: { server: { baseUrl: 'https://gradebook.test' } } as Config,
      queries: {
        findActivityByUrl: async () => records.activity,
        findScopeById: async () => records.scope,
        getUser: async () => records.user,
      } as unknown as AgentAuthQueries,
      mutations: {
        createAuthCode: async () => undefined,
        claimAuthCode: async () => claimedCode,
      } as unknown as AgentAuthMutations,
      tokenIssuer: {
        createAccessToken: async () => 'signed-agent-token',
      } as unknown as AgentTokenIssuer,
      activityRegistration: {
        service: {
          loadPolicy: async () => {
            throw new Error('claimAuthCode must not load the allowlist policy')
          },
          register: async () => {
            throw new Error('claimAuthCode must not register an activity')
          },
        } as unknown as ActivityRegistrationService,
      },
    })

    const result = await service.claimAuthCode({
      code: claimedCode.code,
      client_id: claimedCode.client_id,
      redirect_uri: claimedCode.redirect_uri,
      code_verifier: codeVerifier,
    })

    assert.equal(result.access_token, 'signed-agent-token')
  })

  it('checks the scope before the allowlist, so an unknown scope still reports itself', async () => {
    const { service, createdActivityUrls, inserted, user } = makeService({
      scopeExists: false,
      activityExists: false,
      allowedOrigins: [],
    })

    await assert.rejects(
      service.createAuthCode(new UserAuth(user.id, []), {
        client_id: 'https://elsewhere.test/activity',
        redirect_uri: 'https://elsewhere.test/activity',
        code_challenge: 'challenge',
        scope_id: uuidv7(),
      }),
      (error: CoreError) => {
        assert.equal(error.code, ErrorCodes.VALIDATION)
        return true
      }
    )

    assert.deepEqual(createdActivityUrls, [])
    assert.deepEqual(inserted, [])
  })
})
