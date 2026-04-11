import type { JWTSigner } from '@/lib/jwt/services.js'
import type {
  AccessTokenPayload,
  AdminTokens,
  RefreshTokenPayload,
  SignInResult,
  TokenWithExpiration,
} from '../schemas.js'

export class AdminTokenIssuer {
  private jwtSign: JWTSigner

  constructor(deps: { jwtSign: JWTSigner }) {
    this.jwtSign = deps.jwtSign
  }

  private createAccessToken({ user, abilities }: SignInResult): Promise<TokenWithExpiration> {
    const payload: AccessTokenPayload = {
      user: {
        id: user.id,
        given_name: user.given_name,
        family_name: user.family_name,
        email: user.email,
      },
      abilities: abilities,
      provider: 'admin_session',
    }

    return this.jwtSign.sign(payload, 'access')
  }

  private createRefreshToken({ user: admin_user }: SignInResult): Promise<TokenWithExpiration> {
    const payload: RefreshTokenPayload = {
      admin_user_id: admin_user.id,
    }

    return this.jwtSign.sign(payload, 'refresh')
  }

  async createTokens(signIn: SignInResult): Promise<AdminTokens> {
    return {
      access: await this.createAccessToken(signIn),
      refresh: await this.createRefreshToken(signIn),
      remember_me: signIn.remember_me,
    }
  }
}
