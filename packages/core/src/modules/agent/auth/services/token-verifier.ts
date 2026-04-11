import { type AccessTokenVerificationResult, accessTokenPayloadSchema } from '../types.js'
import type { JWTVerifier } from '@/lib/jwt/services.js'

export class AgentTokenVerifier {
  private jwtVerify: JWTVerifier

  constructor(deps: { jwtVerify: JWTVerifier }) {
    this.jwtVerify = deps.jwtVerify
  }

  verifyAccessToken(token: string): Promise<AccessTokenVerificationResult> {
    return this.jwtVerify.verify(token, accessTokenPayloadSchema)
  }
}
