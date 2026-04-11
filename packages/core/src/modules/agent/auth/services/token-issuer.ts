import type { JWTSigner } from '@/lib/jwt/services.js'
import type { AccessTokenPayload, SignInResult } from '../types.js'

export class AgentTokenIssuer {
  private jwtSign: JWTSigner

  constructor(deps: { jwtSign: JWTSigner }) {
    this.jwtSign = deps.jwtSign
  }

  createAccessToken({ user, activity }: SignInResult): Promise<string> {
    const renew_after = Math.floor(Date.now() / 1000 + 60) // 1 minute

    const payload: AccessTokenPayload = {
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
      activity_id: activity.id,
      renew_after,
    }

    return this.jwtSign.sign(payload, 'refresh').then((value) => value.token)
  }
}
