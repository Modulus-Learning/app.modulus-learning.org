import type { Config } from '@/config.js'
import type { JWTSigner } from '@/lib/jwt/services.js'
import type { AccessTokenPayload, SignInResult } from '../types.js'

export class AgentTokenIssuer {
  private jwtSign: JWTSigner
  private renewAfterSeconds: number

  constructor(deps: { jwtSign: JWTSigner; config: Config }) {
    this.jwtSign = deps.jwtSign
    this.renewAfterSeconds = deps.config.jwt.agent.renewAfterSeconds
  }

  createAccessToken({ user, activity, scope_id }: SignInResult): Promise<string> {
    const renew_after = Math.floor(Date.now() / 1000 + this.renewAfterSeconds)

    const payload: AccessTokenPayload = {
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
      activity_id: activity.id,
      scope_id,
      renew_after,
    }

    return this.jwtSign.sign(payload, 'agent').then((value) => value.token)
  }
}
