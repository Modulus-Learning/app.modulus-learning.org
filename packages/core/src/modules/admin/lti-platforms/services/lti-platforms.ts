import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_PLATFORM_ISSUER_CONFLICT } from '../errors.js'
import { toPlatform } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiPlatformMutations, LtiPlatformQueries } from '../repository.js'
import type {
  CreateLtiPlatformRequest,
  LtiPlatformListResponse,
  LtiPlatformResponse,
} from '../schemas.js'

export class LtiPlatformsService extends BaseService {
  private queries: LtiPlatformQueries
  private mutations: LtiPlatformMutations

  constructor(deps: {
    logger: CoreLogger
    queries: LtiPlatformQueries
    mutations: LtiPlatformMutations
  }) {
    super(deps.logger, 'admin', 'lti-platforms')
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listLtiPlatforms(_auth: AdminAuth): Promise<LtiPlatformListResponse> {
    const platforms = await this.queries.listLtiPlatforms()

    return {
      platforms: platforms.map(toPlatform),
    }
  }

  @method
  async createLtiPlatform(
    _auth: AdminAuth,
    request: CreateLtiPlatformRequest
  ): Promise<LtiPlatformResponse> {
    const existingPlatform = await this.queries.findPlatformByIssuer(request.issuer)
    if (existingPlatform != null) {
      throw ERR_PLATFORM_ISSUER_CONFLICT({
        message: 'LTI Platform with the same issuer already exists',
      }).log(this.logger)
    }

    const newPlatform = await this.mutations.createPlatform({
      id: uuidv7(),
      name: request.name,
      issuer: request.issuer,
      client_id: request.client_id,
      deployment_id: request.deployment_id,
      // TODO: For now we're just hard-coding these endpoints based on the
      // standard urls for Canvas LMS.  In the future (if we keep this method of
      // platform registration), these urls should be configurable in some way.
      authorization_endpoint: new URL('/api/lti/authorize_redirect', request.issuer).href,
      authorization_server: new URL('/login/oauth2/token', request.issuer).href,
      token_endpoint: new URL('/login/oauth2/token', request.issuer).href,
      jwks_uri: new URL('/api/lti/security/jwks', request.issuer).href,
    })

    return { platform: toPlatform(newPlatform) }
  }
}
