import { createHash, randomBytes } from 'node:crypto'

import { BaseService } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED, ERR_VALIDATION } from '@/lib/errors.js'
import { activityUrlNotAllowed } from '@/modules/activity-registration/errors.js'
import type { Config } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityRegistrationService } from '@/modules/activity-registration/services/activity-registration.js'
import type { AgentAuthMutations, AgentAuthQueries } from '../repository/index.js'
import type {
  ClaimAuthCodeRequest,
  ClaimAuthCodeResponse,
  CreateAuthCodeRequest,
  CreateAuthCodeResponse,
} from '../schemas.js'
import type { AgentTokenIssuer } from './token-issuer.js'

export class AgentAuthService extends BaseService {
  private config: Config
  private queries: AgentAuthQueries
  private mutations: AgentAuthMutations
  private tokenIssuer: AgentTokenIssuer
  private registration: ActivityRegistrationService

  constructor(deps: {
    logger: CoreLogger
    config: Config
    queries: AgentAuthQueries
    mutations: AgentAuthMutations
    tokenIssuer: AgentTokenIssuer
    activityRegistration: { service: ActivityRegistrationService }
  }) {
    super(deps.logger, 'agent', 'auth')
    this.config = deps.config
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.tokenIssuer = deps.tokenIssuer
    this.registration = deps.activityRegistration.service
  }

  async createAuthCode(
    userAuth: UserAuth,
    { client_id, redirect_uri, code_challenge, scope_id }: CreateAuthCodeRequest
  ): Promise<CreateAuthCodeResponse> {
    const scope = await this.queries.findScopeById(scope_id)
    if (scope == null) {
      throw ERR_VALIDATION({
        message: 'Unknown scope',
        logExtra: { scope_id },
      }).log(this.logger)
    }

    // Without this gate, any `redirect_uri` a learner's page supplies becomes a
    // registered activity. The order here is load-bearing: evaluate, create the
    // activity, then create the auth code that names it. No transaction is
    // needed -- the activity is committed before the code, so no interleaving
    // yields a code the agent cannot exchange, and a failure after the insert
    // leaves only a bare activity row, which this design already tolerates.
    //
    // A concurrent create of the same allowed URL resolves to the winning row
    // inside `register` and stays successful.
    const policy = await this.registration.loadPolicy()
    const outcome = await this.registration.register(redirect_uri, policy)

    if (!outcome.ok) {
      // Neither an activity nor an authorization code is created.
      //
      // Not `.log()`ed: `details.rejected` carries the whole redirect URI --
      // and this one is a learner's, reached during an authenticated flow.
      // `register()` has already recorded the denial with its normalized
      // origin and path alone, which is the sanctioned diagnostic.
      this.logger.warn(
        { reason: outcome.reason },
        'agent authorization denied by the activity url allowlist'
      )
      throw activityUrlNotAllowed([{ url: outcome.url, reason: outcome.reason }])
    }

    // Deliberately not associated with any activity code. The allowlist
    // expresses site trust, not curriculum ownership.

    const code = randomBytes(60).toString('base64url')
    const expires_at = new Date(Date.now() + 1000 * 60 * 5)

    await this.mutations.createAuthCode({
      code,
      user_id: userAuth.id,
      client_id,
      redirect_uri,
      code_challenge,
      scope_id: scope.id,
      expires_at,
    })

    return { code }
  }

  async claimAuthCode({
    code,
    client_id,
    redirect_uri,
    code_verifier,
  }: ClaimAuthCodeRequest): Promise<ClaimAuthCodeResponse> {
    const authCode = await this.mutations.claimAuthCode(code)

    if (authCode == null) {
      throw ERR_UNAUTHORIZED({
        message: 'Auth code not found',
      }).log(this.logger)
    }

    if (authCode.client_id !== client_id) {
      throw ERR_UNAUTHORIZED({
        message: 'Incorrect client_id',
      }).log(this.logger)
    }

    if (authCode.redirect_uri !== redirect_uri) {
      throw ERR_UNAUTHORIZED({
        message: 'Incorrect redirect_uri',
      }).log(this.logger)
    }

    const code_challenge = createHash('sha256')
      .update(code_verifier, 'utf8')
      .digest()
      .toString('base64url')

    if (authCode.code_challenge !== code_challenge) {
      throw ERR_UNAUTHORIZED({
        message: 'Incorrect code_challenge',
      }).log(this.logger)
    }

    const user = await this.queries.getUser(authCode.user_id)
    if (!user?.is_enabled) {
      throw ERR_UNAUTHORIZED({
        message: 'Unknown user',
      }).log(this.logger)
    }

    const activity = await this.queries.findActivityByUrl(redirect_uri)
    if (!activity) {
      throw ERR_UNAUTHORIZED({
        message: 'Unknown activity',
      }).log(this.logger)
    }

    const scope = await this.queries.findScopeById(authCode.scope_id)
    if (scope == null) {
      throw ERR_UNAUTHORIZED({
        message: 'Unknown scope',
        logExtra: { scope_id: authCode.scope_id },
      }).log(this.logger)
    }

    // TODO: Revisit and clean all this up, in conjunction with any updates
    // needed to the agent.  Is it better to send expiration times to the agent?
    // Should we send any other biographical information?
    const access_token = await this.tokenIssuer.createAccessToken({
      user,
      activity,
      scope_id: scope.id,
    })

    return {
      access_token,
      api_base_url: `${this.config.server.baseUrl}`,
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
      scope_id: scope.id,
      scope_name: scope.name,
    }
  }
}
