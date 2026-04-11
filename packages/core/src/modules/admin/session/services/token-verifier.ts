import {
  type AccessTokenVerificationResult,
  accessTokenPayloadSchema,
  type RefreshTokenVerificationResult,
  refreshTokenPayloadSchema,
} from '../schemas.js'
import type { JWTVerifier } from '@/lib/jwt/services.js'

export class AdminTokenVerifier {
  private jwtVerify: JWTVerifier

  constructor(deps: { jwtVerify: JWTVerifier }) {
    this.jwtVerify = deps.jwtVerify
  }

  async verifyAccessToken(token: string): Promise<AccessTokenVerificationResult> {
    return this.jwtVerify.verify(token, accessTokenPayloadSchema)
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenVerificationResult> {
    return this.jwtVerify.verify(token, refreshTokenPayloadSchema)
  }
}
