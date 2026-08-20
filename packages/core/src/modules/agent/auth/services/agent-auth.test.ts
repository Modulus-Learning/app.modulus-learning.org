import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { UserAuth } from '@/lib/auth.js'
import { ErrorCodes } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { claimAuthCodeSchemas, createAuthCodeSchemas } from '../schemas.js'
import { accessTokenPayloadSchema } from '../types.js'
import { AgentAuthService } from './agent-auth.js'
import { AgentTokenIssuer } from './token-issuer.js'
import type { Config } from '@/config.js'
import type { JWTSigner } from '@/lib/jwt/services.js'
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
}: {
  claimedCode?: AuthCodeRecord
  scopeExists?: boolean
  activityExists?: boolean
  activityCreateReturnsRecord?: boolean
} = {}) => {
  const records = makeRecords()
  const inserted: AuthCodeInsert[] = []
  const createdActivityUrls: string[] = []
  let issued: SignInResult | undefined

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
