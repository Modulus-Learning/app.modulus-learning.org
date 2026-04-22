import { createRemoteJWKSet, jwtVerify } from 'jose'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_ROLES,
} from '../constants.js'
import { ERR_INVALID_LAUNCH } from '../errors.js'
import {
  type PlatformMessage,
  platformMessageSchema,
} from '../types/messages/platform-originating/platform-message.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'
import type { LtiMutations, LtiQueries, PlatformRecord } from '../repository/index.js'
import type { LaunchRequest, LaunchResponse } from '../schemas.js'
import type { DeepLinkingRequest } from '../types/messages/platform-originating/deep-linking-request.js'
import type { ResourceLinkLaunchRequest } from '../types/messages/platform-originating/resource-link-launch-request.js'
type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>

export class LtiLaunchService extends BaseService {
  // TODO: Move this to a seprate service
  platformJWKS: Record<string, RemoteJWKSet> = {}

  private ltiQueries: LtiQueries
  private ltiMutations: LtiMutations
  private activityQueries: ActivityQueries
  private ltiSignInService: LtiSignInService
  private tokens: TokenIssuer

  constructor(deps: {
    logger: CoreLogger
    queries: LtiQueries
    mutations: LtiMutations
    activities: { queries: ActivityQueries }
    session: { ltiSignInService: LtiSignInService; tokenIssuer: TokenIssuer }
  }) {
    super(deps.logger, 'app', 'lti')
    this.ltiQueries = deps.queries
    this.ltiMutations = deps.mutations
    this.activityQueries = deps.activities.queries
    this.ltiSignInService = deps.session.ltiSignInService
    this.tokens = deps.session.tokenIssuer
  }

  /**
   * Handles an incoming LaunchRequest, generating a corresponding
   * LaunchResponse.
   *
   * The launch response includes the launch type, the modulus user account (to
   * be signed in), and the url to redirect the user to.
   *
   * @param request The launch request, comprising an id_token and platform
   * issuer.
   * @returns LaunchResponse
   */
  @method
  async handleLaunch(request: LaunchRequest): Promise<LaunchResponse> {
    const launch = await this.validateLaunch(request)

    const messageType = launch[CLAIM_MESSAGE_TYPE]
    const launchType = launch[CLAIM_CUSTOM].modulus_launch_type

    // We only support specific combinations of messageType and launchType, so
    // to be safe we handle each combination explicitly.
    if (launchType === 'start-activity' && messageType === 'LtiResourceLinkRequest') {
      return await this.handleActivityLaunch(launch)
    }

    if (launchType === 'deep-link' && messageType === 'LtiDeepLinkingRequest') {
      return await this.handleDeepLinkLaunch(launch)
    }

    if (launchType === 'view-dashboard' && messageType === 'LtiResourceLinkRequest') {
      return await this.handleDashboardLaunch(launch)
    }

    throw ERR_INVALID_LAUNCH({
      message: 'unknown launch type',
    }).log(this.logger)
  }

  private async handleActivityLaunch(launch: ResourceLinkLaunchRequest): Promise<LaunchResponse> {
    // TODO: Deep linking should probably add modulus_activity_id rather than
    // (or in addition to) modulus_activity_url
    const { modulus_activity_code: activity_code, modulus_activity_url: activity_url } =
      launch[CLAIM_CUSTOM]
    if (
      activity_code == null ||
      activity_url == null ||
      typeof activity_code !== 'string' ||
      typeof activity_url !== 'string'
    ) {
      throw ERR_INVALID_LAUNCH({
        message: 'missing required custom fields',
      }).log(this.logger)
    }

    // TODO: How to handle this case?  This will arise when an instructor adds
    // (using deep linking) an LTI link to a modulus activity inside their LMS,
    // and later removes the activity from their activity code (using the
    // modulus dashboard).  At a minimum, this and similar errors probably ought
    // to be reported in the LTI launch response, and perhaps pointed out to the
    // instructor that created the lti link (so that they can remove the
    // offending LTI link).
    const activity = await this.activityQueries.findActivityByURL(activity_url)
    if (activity == null) {
      throw ERR_INVALID_LAUNCH({
        message: 'activity not found',
      }).log(this.logger)
    }

    // Sign the user in.
    const signIn = await this.ltiSignInService.signInLti(launch, isInstructor(launch[CLAIM_ROLES]))

    // TODO: We should probably double-check here that activity_code exists, and
    // that the given activity is included the activity code's list of
    // activities.
    const lineitem_url = launch[CLAIM_AGS_ENDPOINT]?.lineitem
    if (lineitem_url != null) {
      let lineitem = await this.ltiQueries.findLineItem({
        user_id: signIn.user.id,
        activity_id: activity.id,
        lineitem_url,
      })

      if (lineitem == null) {
        lineitem = await this.ltiMutations.insertLineItem({
          id: uuidv7(),

          user_id: signIn.user.id,
          activity_id: activity.id,
          lineitem_url,
          submitted_progress: 0,

          platform_issuer: launch.iss,
          lti_user_id: launch.sub,
        })
      } else {
        // TODO: Is there a reason to update lineitem here (e.g. to ensure that
        // platform_issuer / lti_user_id are correct)?
      }

      // Score submission to the LTI platform is handled asynchronously by the
      // ScoreSubmissionProcessor background worker. If this line item has a
      // stale submitted_progress, the worker will discover and submit it.
    }

    const tokens = await this.tokens.createTokens(signIn)

    return {
      type: 'start-activity',
      activity_code,
      activity_url,
      tokens,
    }
  }

  private async handleDeepLinkLaunch(launch: DeepLinkingRequest): Promise<LaunchResponse> {
    const launch_id = uuidv7()
    await this.ltiMutations.insertLaunch({
      id: launch_id,
      launch: JSON.stringify(launch),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 1),
    })

    // Sign the user in.
    const signIn = await this.ltiSignInService.signInLti(launch, isInstructor(launch[CLAIM_ROLES]))
    const tokens = await this.tokens.createTokens(signIn)

    return {
      type: 'deep-link',
      launch_id: launch_id,
      tokens,
    }
  }

  private async handleDashboardLaunch(launch: ResourceLinkLaunchRequest): Promise<LaunchResponse> {
    const signIn = await this.ltiSignInService.signInLti(launch, isInstructor(launch[CLAIM_ROLES]))
    const tokens = await this.tokens.createTokens(signIn)

    return {
      type: 'view-dashboard',
      tokens,
    }
  }

  /**
   * In-memory cache of LTI platform json web key sets.
   *
   * TODO: Should these keysets be persisted?  They're pretty cheap to fetch, so
   * in-memory is probably fine on node, but on some serverless / edge runtimes
   * the cache would be reset on every request.
   */
  private async getPlatformJWKS(platform: PlatformRecord): Promise<RemoteJWKSet> {
    let jwks = this.platformJWKS[platform.id]
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(platform.jwks_uri))
      this.platformJWKS[platform.id] = jwks
    }
    return jwks
  }

  // TODO: It probably makes more sense to parse and extract from the id_token
  // the specific values we need, and return data in a shape that is more useful
  // downstream.
  private async validateLaunch({ id_token, issuer }: LaunchRequest): Promise<PlatformMessage> {
    const platform = await this.ltiQueries.findPlatformByIssuer(issuer)
    if (platform == null) {
      // TODO: Here and below, add more metadata to be logged -- in this case,
      // which platform was it?
      throw ERR_INVALID_LAUNCH({
        message: 'lti platform not found',
      }).log(this.logger)
    }

    const platformJWKS = await this.getPlatformJWKS(platform)

    const verificationResult = await jwtVerify(id_token, platformJWKS, {
      issuer,
      clockTolerance: '10 minutes', // TODO: What's reasonable here?
    }).catch((error) => {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch id_token verification failed',
        cause: error,
      }).log(this.logger)
    })

    // Basic validations of id token / launch parameters -- ensure the token
    // payload has the expected shape.  TODO: It's probably better to only
    // validate the specific values in the id_token that we care about; i.e. we
    // ought to simplify platformMessageSchema so as not to throw an error if a
    // field we don't care about is missing or invalid.
    const validationResult = platformMessageSchema.safeParse(verificationResult.payload)
    if (!validationResult.success) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch failed basic validation',
      }).log(this.logger)
    }

    const launch = validationResult.data

    // Verify token iss claim has the expected value
    if (launch.iss !== issuer) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch has incorrect issuer',
      }).log(this.logger)
    }

    // Verify id_token 'aud' claim matches registered client_id for
    // platform.
    const audienceValid =
      typeof launch.aud === 'string'
        ? launch.aud === platform.client_id
        : launch.aud.includes(platform.client_id)
    if (!audienceValid) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch has incorrect audience',
      }).log(this.logger)
    }

    // Verify id_token 'deployment_id' claim matches registered
    // deployment_id for platform.
    if (launch[CLAIM_DEPLOYMENT_ID] !== platform.deployment_id) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch has incorrect deployment id',
      }).log(this.logger)
    }

    // TODO: Any other validations that apply to all LtiMessages?

    // Verify that the launch nonce is valid and unused.
    const storedNonce = await this.ltiQueries.findNonce(launch.nonce)
    if (storedNonce == null) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch nonce not found',
      }).log(this.logger)
    }

    if (storedNonce.used) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch nonce already used',
      }).log(this.logger)
    }

    // TODO: we need to clean up old nonces.
    await this.ltiMutations.markNonceUsed(launch.nonce)

    return launch
  }
}

// LTI roles that should indicate the user is an instructor for our purposes.
// The LTI spec defines a number of roles without specifying their meaning, so
// for now this list just includes roles that Canvas appears to use.  See:
// https://www.imsglobal.org/spec/lti/v1p3/#role-vocabularies
// https://developerdocs.instructure.com/services/canvas/external-tools/file.canvas_roles
const INSTRUCTOR_LTI_ROLES = [
  // A system / site admin.
  'http://purl.imsglobal.org/vocab/lis/v2/system/person#SysAdmin',

  // Not used by Canvas, but maybe appropriate for other platforms?
  //'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',

  // An instructor within the overal institution / organization.
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',

  // An administrator within the overall institution / organization.
  'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',

  // An instructor within the context (course / assignment) the user launched from.
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',

  // A content developer / designer within the context the user launched from.
  'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
]

const isInstructor = (ltiRoles: string[]): boolean => {
  const ltiRoleSet = new Set(ltiRoles)

  // TODO: Should we also look for the TestUser role?  In Canvas, it indicates
  // that a Canvas instructor / admin is using the 'view as student' feature.
  // const isTestUser = ltiRoleSet.has('http://purl.imsglobal.org/vocab/lis/v2/system/person#TestUser')

  return INSTRUCTOR_LTI_ROLES.some((role) => ltiRoleSet.has(role))
}
