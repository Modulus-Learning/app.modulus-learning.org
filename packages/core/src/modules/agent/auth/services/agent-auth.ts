import { createHash, randomBytes } from 'node:crypto'

import { BaseService } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import type { Config } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
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

  constructor(deps: {
    logger: CoreLogger
    config: Config
    queries: AgentAuthQueries
    mutations: AgentAuthMutations
    tokenIssuer: AgentTokenIssuer
  }) {
    super(deps.logger, 'agent', 'auth')
    this.config = deps.config
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.tokenIssuer = deps.tokenIssuer
  }

  async createAuthCode(
    userAuth: UserAuth,
    { client_id, redirect_uri, code_challenge }: CreateAuthCodeRequest
  ): Promise<CreateAuthCodeResponse> {
    const activity = await this.queries.findActivityByUrl(redirect_uri)
    if (!activity) {
      throw ERR_UNAUTHORIZED({
        message: 'Unknown activity',
        logExtra: { activity_url: redirect_uri },
      }).log(this.logger)
    }

    const code = randomBytes(60).toString('base64url')
    const expires_at = new Date(Date.now() + 1000 * 60 * 5)

    await this.mutations.createAuthCode({
      code,
      user_id: userAuth.id,
      client_id,
      redirect_uri,
      code_challenge,
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

    // TODO: Revisit and clean all this up, in conjunction with any updates
    // needed to the agent.  Is it better to send expiration times to the agent?
    // Should we send any other biographical information?
    const access_token = await this.tokenIssuer.createAccessToken({ user, activity })

    return {
      access_token,
      api_base_url: `${this.config.server.baseUrl}`,
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
    }
  }
}
