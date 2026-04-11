import * as crypto from 'node:crypto'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_INVALID_LOGIN } from '../errors.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiMutations, LtiQueries } from '../repository/index.js'
import type { InitLoginRequest, InitLoginResponse } from '../schemas.js'
import type { AuthenticationRequest } from '../types/launch.js'

export class LtiLoginService extends BaseService {
  private config: Config
  private ltiQueries: LtiQueries
  private ltiMutations: LtiMutations

  constructor(deps: {
    logger: CoreLogger
    config: Config
    queries: LtiQueries
    mutations: LtiMutations
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.ltiQueries = deps.queries
    this.ltiMutations = deps.mutations
  }

  @method
  async handleLogin(data: InitLoginRequest): Promise<InitLoginResponse> {
    const {
      iss,
      // target_link_uri,
      login_hint,
      lti_message_hint,
      // lti_deployment_id,
      client_id,
    } = data

    const platform = await this.ltiQueries.findPlatformByIssuer(iss)
    if (platform == null) {
      // TODO: Should this even be logged?
      throw ERR_INVALID_LOGIN({
        message: 'platform not found in lti login',
      }).log(this.logger)
    }

    // https://www.imsglobal.org/spec/lti/v1p3#client_id-login-parameter
    if (client_id && platform.client_id !== client_id) {
      // TODO: Should this even be logged?
      throw ERR_INVALID_LOGIN({
        message: 'incorrect client_id in lti login',
      }).log(this.logger)
    }

    // TODO: What should we do with target_link_uri here?

    // TODO: What should we do with the lti_deployment_id if present?

    // Generate nonce, which will be included as a claim in the id_token during
    // the subsequent launch.  As part of validating the id_token, we will check
    // that the nonce is one we've generated, and that it hasn't been used.
    // https://openid.net/specs/openid-connect-core-1_0.html#IDToken
    const nonce = crypto.randomBytes(30).toString('base64url')
    await this.ltiMutations.insertNonce(nonce)

    // Generate random state value which will be reflected back in the
    // subsequent launch request.
    const state = crypto.randomBytes(30).toString('base64url')

    const authenticationRequest: AuthenticationRequest = {
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid',
      prompt: 'none',
      client_id: platform.client_id,
      redirect_uri: this.config.lti.redirect_uri,
      login_hint,
      nonce,
      state,
      lti_message_hint,
    }

    const redirectUrl = new URL(platform.authorization_endpoint)
    for (const [key, val] of Object.entries(authenticationRequest)) {
      redirectUrl.searchParams.set(key, val)
    }

    return {
      redirectUrl: redirectUrl.toString(),
      stateId: state,
      stateValue: iss,
    }
  }
}
