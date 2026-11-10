import type { LmsAdapter } from '@modulus-learning/lti'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND } from '@/lib/errors.js'
import { ERR_PLATFORM_ISSUER_CONFLICT } from '../errors.js'
import { toPlatform } from '../utils.js'
import type { Config } from '@/config.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { LtiPlatformMutations, LtiPlatformQueries } from '../repository.js'
import type {
  CreateLtiPlatformRequest,
  GenerateCanvasConfigRequest,
  GenerateCanvasConfigResponse,
  LtiPlatformListResponse,
  LtiPlatformResponse,
} from '../schemas.js'

export class LtiPlatformsService extends BaseService {
  private config: Config
  private ltiKeyStore: LtiKeyStore
  private queries: LtiPlatformQueries
  private mutations: LtiPlatformMutations
  private lms: LmsAdapter

  constructor(deps: {
    logger: CoreLogger
    config: Config
    ltiKeyStore: LtiKeyStore
    queries: LtiPlatformQueries
    mutations: LtiPlatformMutations
    lmsAdapter: LmsAdapter
  }) {
    super(deps.logger, 'admin', 'lti-platforms')
    this.config = deps.config
    this.ltiKeyStore = deps.ltiKeyStore
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.lms = deps.lmsAdapter
  }

  @method
  async listLtiPlatforms(_auth: AdminAuth): Promise<LtiPlatformListResponse> {
    const platforms = await this.queries.listLtiPlatforms()

    return {
      platforms: platforms.map(toPlatform),
    }
  }

  @method
  async getLtiPlatform(_auth: AdminAuth, request: { id: string }): Promise<LtiPlatformResponse> {
    const platform = await this.queries.findPlatformById(request.id)

    if (platform == null) {
      throw ERR_NOT_FOUND({
        message: 'Platform not found',
      }).log(this.logger)
    }

    return {
      platform: toPlatform(platform),
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
      // The LMS adapter knows its platform's standard endpoints.
      ...this.lms.registrationEndpoints(request.issuer),
    })

    return { platform: toPlatform(newPlatform) }
  }

  @method
  async generateCanvasConfig(
    _auth: AdminAuth,
    {
      title = 'Modulus',
      description = 'Open Educational Learning',
      tool_id = 'modulus',
      platform = 'canvas.instructure.com',
    }: GenerateCanvasConfigRequest
  ): Promise<GenerateCanvasConfigResponse> {
    if (this.lms.registrationConfig == null) {
      throw ERR_NOT_FOUND({
        message: `the ${this.lms.id} adapter does not generate registration configuration`,
      }).log(this.logger)
    }
    const config_json = this.lms.registrationConfig({
      baseUrl: this.config.server.baseUrl,
      host: this.config.server.host,
      publicJwk: this.ltiKeyStore.getJWKS().keys[0],
      title,
      description,
      tool_id,
      platform,
    })

    return { config_json }
  }
}
