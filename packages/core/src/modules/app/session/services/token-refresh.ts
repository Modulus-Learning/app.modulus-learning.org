import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import { toSignInResult } from '../utils.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { SessionQueries } from '../repository/index.js'
import type { TokenRefreshRequest, TokenRefreshResponse } from '../schemas.js'
import type { TokenIssuer } from './token-issuer.js'
import type { TokenVerifier } from './token-verifier.js'

export class TokenRefreshService extends BaseService {
  private queries: SessionQueries
  private tokenVerifier: TokenVerifier
  private tokenIssuer: TokenIssuer

  constructor(deps: {
    logger: CoreLogger
    queries: SessionQueries
    tokenVerifier: TokenVerifier
    tokenIssuer: TokenIssuer
  }) {
    super(deps.logger, 'app', 'session')
    this.queries = deps.queries
    this.tokenVerifier = deps.tokenVerifier
    this.tokenIssuer = deps.tokenIssuer
  }

  @method
  // TODO: Should TokenRefreshRequest include ip_address for logging and/or blacklisting?
  async refreshTokens({ refreshToken }: TokenRefreshRequest): Promise<TokenRefreshResponse> {
    const { status, payload } = await this.tokenVerifier.verifyRefreshToken(refreshToken)

    if (status !== 'valid') {
      throw ERR_UNAUTHORIZED({
        message: 'invalid refresh token',
      }).log(this.logger)
    }

    const { user_id } = payload

    const userRecord = await this.queries.getUser(user_id)
    if (userRecord == null) {
      throw ERR_UNAUTHORIZED({
        message: 'user not found',
        logExtra: { user_id },
      }).log(this.logger)
    }

    if (!userRecord.is_enabled) {
      throw ERR_UNAUTHORIZED({
        message: 'user is disabled',
        logExtra: { user_id },
      }).log(this.logger)
    }

    const abilities = await this.queries.getUserAbilities(user_id)

    const signIn = toSignInResult(userRecord, abilities)

    const tokens = await this.tokenIssuer.createTokens(toSignInResult(userRecord, abilities))

    return {
      tokens,
      session: {
        user: signIn.user,
        abilities,
      },
    }
  }
}
