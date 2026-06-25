import crypto from 'node:crypto'

import { SignJWT } from 'jose'

import { BaseService } from '@/lib/base-service.js'
import { SCOPE_AGS_LINEITEM, SCOPE_AGS_RESULT_READONLY, SCOPE_AGS_SCORE } from '../constants.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { PlatformRecord } from '../repository/index.js'
import type { AccessToken, AccessTokenResult } from '../types/access-token.js'

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
  private config: Config
  private keystore: LtiKeyStore
  private tokens: Record<string, AccessToken> = {}

  constructor(deps: {
    logger: CoreLogger
    config: Config
    ltiKeyStore: LtiKeyStore
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.keystore = deps.ltiKeyStore
  }

  async getAccessToken(platform: PlatformRecord): Promise<AccessTokenResult> {
    const accessToken = this.tokens[platform.id]

    if (accessToken == null || accessToken.expires.getTime() < Date.now() + 30000) {
      return await this.fetchAccessToken(platform)
    }

    return {
      ok: true,
      accessToken,
    }
  }

  invalidateAccessToken(platform: PlatformRecord, accessToken: AccessToken) {
    if (this.tokens[platform.id]?.token === accessToken.token) {
      delete this.tokens[platform.id]
    }
  }

  private async fetchAccessToken(platform: PlatformRecord): Promise<AccessTokenResult> {
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
      signal: AbortSignal.timeout(this.config.lti.score_submission.request_timeout_seconds),
    }).catch(() => null) // TODO: Should we log here?  Handle TimeoutError differently than other fetch errors?

    if (tokenResponse == null) {
      this.logger.warn({ issuer: platform.issuer }, 'network error fetching access token')
      return {
        ok: false,
        category: 'transient',
        message: 'network error fetching access token',
      }
    }

    const status = tokenResponse.status
    const text = await tokenResponse.text().catch(() => null)

    if (text == null) {
      this.logger.warn({ status, issuer: platform.issuer }, 'failed to read access token response')
      return {
        ok: false,
        category: 'transient',
        message: 'failed to read access token response',
        status_code: status,
      }
    }

    if (!tokenResponse.ok) {
      // TODO: Add a proper error classifier here.
      this.logger.warn({ status, issuer: platform.issuer }, 'access token request failed')
      return {
        ok: false,
        category:
          tokenResponse.status >= 500
            ? 'transient'
            : tokenResponse.status === 429
              ? 'rate_limit'
              : 'platform_config',
        message: 'access token request failed',
        status_code: status,
      }
    }

    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      this.logger.warn(
        { status, issuer: platform.issuer },
        'access token response is not valid JSON'
      )
      return {
        ok: false,
        // TODO: Different category?
        category: 'unknown',
        message: 'access token response is not valid JSON',
        status_code: status,
      }
    }

    const access_token = data?.access_token
    const expires_in = data?.expires_in
    const scope = data?.scope

    if (
      typeof access_token !== 'string' ||
      typeof expires_in !== 'number' ||
      typeof scope !== 'string'
    ) {
      this.logger.warn(
        {
          status,
          issuer: platform.issuer,
        },
        'malformed access token response body'
      )
      return {
        ok: false,
        // TODO: Different category?
        category: 'unknown',
        message: 'malformed access token response body',
        status_code: status,
      }
    }

    const expires = new Date()
    expires.setTime(expires.getTime() + expires_in * 1000)
    const accessToken = {
      token: access_token,
      expires,
      scopes: scope.split(' '),
    }

    return {
      ok: true,
      accessToken,
    }
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
