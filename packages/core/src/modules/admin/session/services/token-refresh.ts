import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import { toSignInResult } from '../utils.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminSessionQueries } from '../repository/index.js'
import type { TokenRefreshRequest, TokenRefreshResponse } from '../schemas.js'
import type { AdminTokenIssuer } from './token-issuer.js'
import type { AdminTokenVerifier } from './token-verifier.js'

export class AdminTokenRefreshService extends BaseService {
  private queries: AdminSessionQueries
  private tokenVerifier: AdminTokenVerifier
  private tokenIssuer: AdminTokenIssuer

  constructor(deps: {
    logger: CoreLogger
    queries: AdminSessionQueries
    tokenVerifier: AdminTokenVerifier
    tokenIssuer: AdminTokenIssuer
  }) {
    super(deps.logger, 'admin', 'session')
    this.queries = deps.queries
    this.tokenVerifier = deps.tokenVerifier
    this.tokenIssuer = deps.tokenIssuer
  }

  @method
  async refreshTokens({ adminRefreshToken }: TokenRefreshRequest): Promise<TokenRefreshResponse> {
    const { status, payload } = await this.tokenVerifier.verifyRefreshToken(adminRefreshToken)

    if (status !== 'valid') {
      throw ERR_UNAUTHORIZED({ message: 'invalid refresh token' }).log(this.logger)
    }

    const { admin_user_id } = payload

    const adminUserRecord = await this.queries.getAdminUser(admin_user_id)
    if (adminUserRecord == null) {
      throw ERR_UNAUTHORIZED({ message: 'user not found', logExtra: { admin_user_id } }).log(
        this.logger
      )
    }

    if (!adminUserRecord.is_enabled) {
      throw ERR_UNAUTHORIZED({ message: 'user is disabled', logExtra: { admin_user_id } }).log(
        this.logger
      )
    }

    // TODO: Double-check that no updates to the user table are needed.

    const admin_abilities = await this.queries.getAdminUserAbilities(admin_user_id)

    const signIn = toSignInResult(adminUserRecord, admin_abilities)
    const tokens = await this.tokenIssuer.createTokens(
      toSignInResult(adminUserRecord, admin_abilities)
    )

    return {
      tokens,
      session: {
        user: signIn.user,
        abilities: admin_abilities,
        provider: 'admin_session',
      },
    }
  }
}
