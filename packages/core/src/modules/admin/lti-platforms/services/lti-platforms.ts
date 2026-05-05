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

  constructor(deps: {
    logger: CoreLogger
    config: Config
    ltiKeyStore: LtiKeyStore
    queries: LtiPlatformQueries
    mutations: LtiPlatformMutations
  }) {
    super(deps.logger, 'admin', 'lti-platforms')
    this.config = deps.config
    this.ltiKeyStore = deps.ltiKeyStore
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
    const baseUrl = new URL(this.config.server.baseUrl)

    const config = {
      title,
      description,
      target_link_uri: this.config.server.baseUrl.toString(),
      oidc_initiation_url: new URL('/routes/lti/login', baseUrl).toString(),
      public_jwk: this.ltiKeyStore.getJWKS().keys[0],
      custom_fields: {},
      scopes: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        // 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
        // 'https://canvas.instructure.com/lti/account_lookup/scope/show',
        // 'https://canvas.instructure.com/lti-ags/progress/scope/show',
        // 'https://canvas.instructure.com/lti/page_content/show',
      ],
      extensions: [
        {
          domain: this.config.server.host,
          tool_id,
          privacy_level: 'public',
          platform,
          settings: {
            // TODO: platform,
            placements: [
              {
                text: 'Create a Modulus Assignment',
                placement: 'assignment_selection',
                message_type: 'LtiDeepLinkingRequest',
                custom_fields: {
                  context_id: '$Context.id',
                  context_title: '$Context.title',
                  canvas_course_id: '$Canvas.course.id',
                  canvas_course_name: '$Canvas.course.name',
                  modulus_launch_type: 'deep-link',
                  modulus_deep_link_context: 'assignment',
                  com_instructure_context_uuid: '$com.instructure.Context.uuid',
                  com_instructure_context_label: '$com.instructure.contextLabel',
                  com_instructure_assignment_lti_id: '$com.instructure.Assignment.lti.id',
                },
                target_link_uri: 'https://modulus.infonomic.local:3000/lti/deep-link',
              },
              {
                text: 'Link to a Modulus activity',
                placement: 'link_selection',
                message_type: 'LtiDeepLinkingRequest',
                custom_fields: {
                  context_id: '$Context.id',
                  context_title: '$Context.title',
                  canvas_course_id: '$Canvas.course.id',
                  canvas_course_name: '$Canvas.course.name',
                  modulus_launch_type: 'deep-link',
                  modulus_deep_link_context: 'standalone',
                  com_instructure_context_label: '$com.instructure.contextLabel',
                },
                target_link_uri: 'https://modulus.infonomic.local:3000/lti/deep-link',
              },
              {
                text: 'Link to a Modulus activity',
                placement: 'editor_button',
                message_type: 'LtiDeepLinkingRequest',
                custom_fields: {
                  context_id: '$Context.id',
                  context_title: '$Context.title',
                  canvas_course_id: '$Canvas.course.id',
                  canvas_course_name: '$Canvas.course.name',
                  modulus_launch_type: 'deep-link',
                  modulus_deep_link_context: 'standalone',
                  com_instructure_context_label: '$com.instructure.contextLabel',
                },
                target_link_uri: 'https://modulus.infonomic.local:3000/lti/deep-link',
              },
              {
                text: 'View Modulus Dashboard',
                placement: 'user_navigation',
                message_type: 'LtiResourceLinkRequest',
                windowTarget: '_blank',
                custom_fields: {
                  modulus_launch_type: 'view-dashboard',
                },
                target_link_uri: 'https://modulus.infonomic.local:3000/dashboard',
                required_permissions: 'manage_students',
              },
            ],
          },
        },
      ],
    }

    return {
      config_json: JSON.stringify(config, null, 2),
    }
  }
}
