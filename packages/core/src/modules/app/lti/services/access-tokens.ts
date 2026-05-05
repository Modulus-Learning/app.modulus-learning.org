import crypto from 'node:crypto'

import { SignJWT } from 'jose'

import { BaseService } from '@/lib/base-service.js'
import { SCOPE_AGS_LINEITEM, SCOPE_AGS_RESULT_READONLY, SCOPE_AGS_SCORE } from '../constants.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { PlatformRecord } from '../repository/index.js'
import type { AccessToken } from '../types/access-token.js'

/***
 * Manages access tokens for making API requests to LTI platforms.
 *
 * Currently we store at most one token per platform (and identify tokens by the
 * corresponding platform), but in the future we might might need multiple
 * tokens with different sets of scopes, or need different tokens for different
 * LTI deployments within a platform.
 *
 * Since Canvas API tokens only last for 1 hour (and we currently only support
 * canvas), we simply store tokens in memory, and preemptively fetch a new one
 * when the current one is about to expire.
 */
export class AccessTokenManager extends BaseService {
  private keystore: LtiKeyStore
  private tokens: Record<string, AccessToken> = {}

  constructor(deps: {
    logger: CoreLogger
    ltiKeyStore: LtiKeyStore
  }) {
    super(deps.logger, 'app', 'lti')
    this.keystore = deps.ltiKeyStore
  }

  async getAccessToken(platform: PlatformRecord): Promise<AccessToken> {
    let token = this.tokens[platform.id]

    if (token == null || token.expires.getTime() < Date.now() + 30000) {
      token = await this.fetchAccessToken(platform)
      this.tokens[platform.id] = token
    }

    return token
  }

  private async fetchAccessToken(platform: PlatformRecord): Promise<AccessToken> {
    const clientAssertionJWT = await this.createLTIClientAssertionJWT(platform)

    const scopes = [SCOPE_AGS_LINEITEM, SCOPE_AGS_RESULT_READONLY, SCOPE_AGS_SCORE]

    const body = new URLSearchParams()
    body.set('grant_type', 'client_credentials')
    body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    body.set('client_assertion', clientAssertionJWT)
    body.set('scope', scopes.join(' '))

    const tokenResponse = await fetch(platform.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!tokenResponse.ok) {
      throw new Error('Failed to fetch access token')
    }
    // TODO: validate response?
    const { access_token, expires_in, scope } = (await tokenResponse.json()) as {
      access_token: string
      expires_in: number
      scope: string
    }

    const expires = new Date()
    expires.setTime(expires.getTime() + expires_in * 1000)
    const accessToken = {
      token: access_token,
      expires,
      scopes: scope.split(' '),
    }

    return accessToken
  }

  private async createLTIClientAssertionJWT(platform: PlatformRecord): Promise<string> {
    const typ = 'JWT'
    const alg = 'RS256'
    const kid = this.keystore.getKeyID()
    const privateKey = this.keystore.getPrivateKey()

    const jwt = await new SignJWT()
      .setProtectedHeader({ typ, alg, kid })
      .setIssuer(platform.client_id)
      .setSubject(platform.client_id)
      .setAudience(platform.authorization_server)
      .setIssuedAt()
      .setExpirationTime('1 minute') // TODO: More / less lenient?  Configurable?
      .setJti(crypto.randomBytes(30).toString('base64')) // TODO: Generate/encode differently?
      .sign(privateKey)

    return jwt
  }
}
