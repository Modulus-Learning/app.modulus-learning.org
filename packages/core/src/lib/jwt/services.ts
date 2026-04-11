import { type CryptoKey, importPKCS8, importSPKI, type JWTPayload, jwtVerify, SignJWT } from 'jose'
import { JWTExpired } from 'jose/errors'
import type { z } from 'zod'

import { BaseService, method } from '../base-service.js'
import { ERR_JWT_ENCODE } from './errors.js'
import type { CoreLogger } from '../logger.js'
import type {
  JWTSignerConfig,
  JWTVerificationResult,
  JWTVerifierConfig,
  JWTWithExpiration,
} from './types.js'

export class JWTSigner extends BaseService {
  constructor(
    logger: CoreLogger,
    private config: JWTSignerConfig,
    private privateKey: CryptoKey
  ) {
    super(logger, 'lib', 'jwt')
  }

  static async create(logger: CoreLogger, config: JWTSignerConfig): Promise<JWTSigner> {
    const privateKey = await importPKCS8(config.privateKey, 'RS256')
    return new JWTSigner(logger, config, privateKey)
  }

  @method
  async sign(payload: JWTPayload, type: 'access' | 'refresh'): Promise<JWTWithExpiration> {
    const expiration_in_ms = Date.now() + this.config.expires[type] * 1000

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiration_in_ms / 1000))
      .setAudience(this.config.audience)
      .setIssuer(this.config.issuer)
      .sign(this.privateKey)
      .catch((cause) => {
        throw ERR_JWT_ENCODE({ message: 'failed to encode jwt', cause }).log(this.logger)
      })

    return { token, expiration_in_ms }
  }
}

export class JWTVerifier extends BaseService {
  constructor(
    logger: CoreLogger,
    private config: JWTVerifierConfig,
    private publicKey: CryptoKey
  ) {
    super(logger, 'lib', 'jwt')
  }

  static async create(deps: {
    logger: CoreLogger
    config: JWTVerifierConfig
  }): Promise<JWTVerifier> {
    const publicKey = await importSPKI(deps.config.publicKey, 'RS256')
    return new JWTVerifier(deps.logger, deps.config, publicKey)
  }

  @method
  async verify<TPayload>(
    token: string,
    schema: z.ZodType<TPayload>
  ): Promise<JWTVerificationResult<TPayload>> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
      })

      const { success, data, error } = schema.safeParse(payload)

      if (!success || payload.exp == null) {
        this.logger.warn(error ? { err: error } : { message: 'missing exp field in jwt' })
        return { status: 'bad_payload' }
      }

      return {
        status: 'valid',
        payload: data,
        expires_at_ms: payload.exp * 1000,
      }
    } catch (error) {
      // TODO: Should any errors here be logged?
      if (error instanceof JWTExpired) {
        return { status: 'expired' }
      }
      return { status: 'invalid', error }
    }
  }
}
