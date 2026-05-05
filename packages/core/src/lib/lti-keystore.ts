import {
  type CryptoKey,
  exportJWK,
  importPKCS8,
  importSPKI,
  type JSONWebKeySet,
  type JWTPayload,
  SignJWT,
} from 'jose'

import type { Config } from '@/config.js'

/**
 * Service for managing JSON web key sets for communicating with LTI platforms.
 *
 * TODO: Add persistent storage for these keys -- for now, we're just storing
 * them in memory (and regenerating them every time the app restarts).
 */
export class LtiKeyStore {
  constructor(
    // Current jwks key id, corresponding to current private key.
    private kid: string,

    // Current private key
    private privateKey: CryptoKey,

    // Current and recent public keys
    private jwks: JSONWebKeySet
  ) {}

  static async create({ config }: { config: Config }): Promise<LtiKeyStore> {
    const kid = config.lti.jwks.kid
    const privateKey = await importPKCS8(config.lti.jwks.privateKey, 'RS256')
    const publicKey = await importSPKI(config.lti.jwks.publicKey, 'RS256')
    const publicKeyJwk = await exportJWK(publicKey)
    const jwks = {
      keys: [
        {
          ...publicKeyJwk,
          alg: 'RS256',
          use: 'sig',
          kid,
        },
      ],
    }

    return new LtiKeyStore(kid, privateKey, jwks)
  }

  getJWKS(): JSONWebKeySet {
    return this.jwks
  }

  getKeyID(): string {
    return this.kid
  }

  getPrivateKey(): CryptoKey {
    return this.privateKey
  }

  async signPlatformMessage<T extends JWTPayload>(
    payload: T,
    exp?: number | string | Date
  ): Promise<string> {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuedAt()
      .setExpirationTime(exp ?? '1 minute')
      .sign(this.privateKey)
  }
}
