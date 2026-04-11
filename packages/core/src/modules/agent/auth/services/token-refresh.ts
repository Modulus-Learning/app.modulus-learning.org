import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AgentAuthQueries } from '../repository/index.js'
import type { AgentTokenIssuer } from './token-issuer.js'

export class TokenRefreshService extends BaseService {
  private queries: AgentAuthQueries
  private tokenIssuer: AgentTokenIssuer

  constructor(deps: {
    logger: CoreLogger
    queries: AgentAuthQueries
    tokenIssuer: AgentTokenIssuer
  }) {
    super(deps.logger, 'agent', 'auth')
    this.queries = deps.queries
    this.tokenIssuer = deps.tokenIssuer
  }

  @method
  async refreshToken(auth: AgentAuth): Promise<string | undefined> {
    this.logger.info(
      `Checking if token renewal is needed (${auth.renew_after * 1000 - Date.now()} ms left)`
    )
    if (Date.now() < auth.renew_after * 1000) {
      return undefined
    }

    this.logger.info('Renewing token!')

    const user = await this.queries.getUser(auth.user_id)
    if (user == null) {
      throw ERR_UNAUTHORIZED({
        message: 'user not found',
        logExtra: { user_id: auth.user_id },
      }).log(this.logger)
    }

    if (!user.is_enabled) {
      throw ERR_UNAUTHORIZED({
        message: 'user is disabled',
        logExtra: { user_id: auth.user_id },
      }).log(this.logger)
    }

    const activity = await this.queries.getActivity(auth.activity_id)
    if (activity == null) {
      throw ERR_UNAUTHORIZED({
        message: 'activity not found',
        logExtra: { activity_id: auth.activity_id },
      }).log(this.logger)
    }

    return await this.tokenIssuer.createAccessToken({ user, activity })
  }
}
