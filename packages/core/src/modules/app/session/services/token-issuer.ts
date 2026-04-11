import type { JWTSigner } from '@/lib/jwt/services.js'
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  SignInResult,
  TokenWithExpiration,
  UserTokens,
} from '../schemas.js'

// TODO: Should this inherit BaseService?
export class TokenIssuer {
  private jwtSign: JWTSigner

  constructor(deps: { jwtSign: JWTSigner }) {
    this.jwtSign = deps.jwtSign
  }

  private createAccessToken({ user, abilities }: SignInResult): Promise<TokenWithExpiration> {
    const payload: AccessTokenPayload = {
      user: {
        id: user.id,
        full_name: user.full_name,
      },
      abilities,
    }

    return this.jwtSign.sign(payload, 'access')
  }

  private createRefreshToken({ user }: SignInResult): Promise<TokenWithExpiration> {
    const payload: RefreshTokenPayload = {
      user_id: user.id,
    }

    return this.jwtSign.sign(payload, 'refresh')
  }

  async createTokens(signIn: SignInResult): Promise<UserTokens> {
    return {
      access: await this.createAccessToken(signIn),
      refresh: await this.createRefreshToken(signIn),
      remember_me: signIn.remember_me,
    }
  }
}
