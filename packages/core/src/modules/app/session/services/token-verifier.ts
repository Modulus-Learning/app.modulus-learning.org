import {
  type AccessTokenVerificationResult,
  accessTokenPayloadSchema,
  type RefreshTokenVerificationResult,
  refreshTokenPayloadSchema,
} from '../schemas.js'
import type { JWTVerifier } from '@/lib/jwt/services.js'

// TODO: Should this inherit BaseService?
export class TokenVerifier {
  private jwtVerify: JWTVerifier

  constructor(deps: { jwtVerify: JWTVerifier }) {
    this.jwtVerify = deps.jwtVerify
  }

  verifyAccessToken(token: string): Promise<AccessTokenVerificationResult> {
    return this.jwtVerify.verify(token, accessTokenPayloadSchema)
  }

  verifyRefreshToken(token: string): Promise<RefreshTokenVerificationResult> {
    return this.jwtVerify.verify(token, refreshTokenPayloadSchema)
  }
}
