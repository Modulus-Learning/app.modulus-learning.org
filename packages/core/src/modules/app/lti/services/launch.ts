import type {
  DeepLinkingRequest,
  LmsAdapter,
  ResourceLinkLaunchRequest,
  TermInspection,
} from '@modulus-learning/lti'
import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEEP_LINKING_SETTINGS,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  effectiveCutoff,
  type PlatformMessage,
  platformMessageSchema,
} from '@modulus-learning/lti'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { v7 as uuidv7 } from 'uuid'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import { ERR_INVALID_LAUNCH } from '../errors.js'
import type { Config } from '@/config.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type { EnrollmentService } from '@/modules/app/activities/services/enrollment.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'
import type { LtiMutations, LtiQueries, PlatformRecord } from '../repository/index.js'
import type { LaunchRequest, LaunchResponse } from '../schemas.js'

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>

export type VerifiedLaunchScope = {
  scope_id: string
  scope_name: string | null
}

type ScopeResolutionOptions = {
  verified_at?: Date
  logger?: Pick<CoreLogger, 'info'>
}

export const resolveVerifiedLaunchScope = async (
  mutations: Pick<LtiMutations, 'resolvePlatformScope'>,
  platform_id: string,
  inspection: TermInspection,
  options: ScopeResolutionOptions = {}
): Promise<VerifiedLaunchScope> => {
  const { term, quality } = inspection
  if (term == null) {
    const resolved = { scope_id: DEFAULT_SCOPE_ID, scope_name: null }
    options.logger?.info(
      { scope_id: resolved.scope_id, source: 'default', quality },
      'activity scope resolved'
    )
    return resolved
  }

  const scope = await mutations.resolvePlatformScope({
    platform_id,
    ...term,
    last_verified_launch_at: options.verified_at ?? new Date(),
  })

  const resolved = { scope_id: scope.id, scope_name: scope.name }
  options.logger?.info(
    { scope_id: resolved.scope_id, source: 'platform', quality },
    'activity scope resolved'
  )
  return resolved
}

type VerifiedLaunch = {
  launch: PlatformMessage
  platform: PlatformRecord
}

export class LtiLaunchService extends BaseService {
  // TODO: Move this to a seprate service
  private platformJWKS: Record<string, RemoteJWKSet> = {}

  private config: Config
  private tx: TXManager
  private ltiQueries: LtiQueries
  private ltiMutations: LtiMutations
  private activityQueries: ActivityQueries
  private enrollmentService: EnrollmentService
  private ltiSignInService: LtiSignInService
  private tokens: TokenIssuer
  private lms: LmsAdapter

  constructor(deps: {
    logger: CoreLogger
    config: Config
    tx: TXManager
    queries: LtiQueries
    mutations: LtiMutations
    activities: { queries: ActivityQueries; enrollmentService: EnrollmentService }
    session: { ltiSignInService: LtiSignInService; tokenIssuer: TokenIssuer }
    lmsAdapter: LmsAdapter
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.tx = deps.tx
    this.ltiQueries = deps.queries
    this.ltiMutations = deps.mutations
    this.activityQueries = deps.activities.queries
    this.enrollmentService = deps.activities.enrollmentService
    this.ltiSignInService = deps.session.ltiSignInService
    this.tokens = deps.session.tokenIssuer
    this.lms = deps.lmsAdapter
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
    const { launch, platform } = await this.validateLaunch(request)

    // Record the deployment (if new) once the launch is verified. Verification
    // itself writes only the nonce claim, so a rejected launch writes nothing
    // else; this is the point to apply a future deployment allowlist.
    await this.ltiMutations.upsertPlatformDeployment(launch.iss, launch[CLAIM_DEPLOYMENT_ID])

    const messageType = launch[CLAIM_MESSAGE_TYPE]
    const launchType = launch[CLAIM_CUSTOM].modulus_launch_type

    // We only support specific combinations of messageType and launchType, so
    // to be safe we handle each combination explicitly.
    if (launchType === 'start-activity' && messageType === 'LtiResourceLinkRequest') {
      return await this.handleActivityLaunch(launch, platform)
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

  private async handleActivityLaunch(
    launch: ResourceLinkLaunchRequest,
    platform: PlatformRecord
  ): Promise<LaunchResponse> {
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

    // An LTI link whose activity code no longer resolves, or whose activity has
    // since been removed from that code, still honours the link: enrollment is
    // skipped with a warning below and the launch response is unchanged.  An
    // activity URL that resolves to no `activities` row at all is a different
    // matter -- there is nothing to launch -- and remains an invalid launch.
    const activity = await this.activityQueries.findActivityByURL(activity_url)
    if (activity == null) {
      throw ERR_INVALID_LAUNCH({
        message: 'activity not found',
      }).log(this.logger)
    }

    const interpretation = this.lms.interpretLaunch(launch)
    const scope = await resolveVerifiedLaunchScope(
      this.ltiMutations,
      platform.id,
      interpretation.term,
      { logger: this.logger }
    )

    // Sign the user in.
    const signIn = await this.ltiSignInService.signInLti(launch, interpretation.isInstructor)

    // Enroll the launching user in the activity code.  This is the earliest
    // point with a trusted learner id, and it deliberately runs before the
    // redirect is returned, whether or not the launch carries an AGS endpoint,
    // and outside the AGS transaction below -- a line-item reconciliation
    // failure must not roll enrollment back.
    //
    // The shared service decides eligibility from core's own records: a code
    // that does not resolve, or an activity no longer associated with it, warns
    // and skips without changing this response.  Current policy makes no
    // distinction by role, so an instructor performing a resource-link launch
    // enrolls in the same cohort as a learner.
    await this.enrollmentService.enrollByPublicActivityCode({
      user_id: signIn.user.id,
      activity_code,
      activity_id: activity.id,
    })

    const lineitem_url = launch[CLAIM_AGS_ENDPOINT]?.lineitem
    if (lineitem_url != null) {
      // The standard field first, then the adapter's own fallback.
      const cutoff_at = effectiveCutoff(launch[CLAIM_CUSTOM], interpretation.cutoffFallback)

      await this.tx.withTransaction(async () => {
        await this.ltiMutations.upsertProgress(activity.id, signIn.user.id, scope.scope_id)

        const submittable_progress = await this.ltiQueries.getProgressWithCutoff(
          signIn.user.id,
          activity.id,
          scope.scope_id,
          cutoff_at
        )

        // Insert a complete line item when none exists.  A conflicting identity
        // is locked before reconciliation: the same-scope branch revives the
        // row while preserving submission state, while a verified scope change
        // rebinds the row and resets stale submission, retry, and lease state.
        //
        // Same-scope launches deliberately leave an in-flight worker's fencing
        // token untouched.  A scope rebind clears that token, so the stale
        // completion is rejected by the existing id/token fence.
        await this.ltiMutations.reconcileLineItem({
          user_id: signIn.user.id,
          activity_id: activity.id,
          scope_id: scope.scope_id,
          platform_issuer: launch.iss,
          deployment_id: launch[CLAIM_DEPLOYMENT_ID],
          lineitem_url,
          lti_user_id: launch.sub,
          cutoff_at,
          submittable_progress,
        })
      })
    }

    const tokens = await this.tokens.createTokens(signIn)

    // The resolved row is the authority for both activity fields.
    // `activity.url` and the `activity_url` claim agree today --
    // `findActivityByURL` matched on that exact value -- but the redirect is
    // built from the database column, not from the claim.  `activity_code`
    // stays in the response: enrollment above still needs it and it is
    // informative in the logs, even though nothing downstream of the launch
    // route consumes it.
    //
    // `modulus_server_url` is carried so that a launch route redirecting
    // straight to the activity stamps the same `modulus` value the
    // interstitial would have -- both come from this one config key rather
    // than from two that merely happen to agree.
    return {
      type: 'start-activity',
      activity_code,
      activity_id: activity.id,
      activity_url: activity.url,
      modulus_server_url: this.config.server.baseUrl,
      ...scope,
      tokens,
    }
  }

  private async handleDeepLinkLaunch(launch: DeepLinkingRequest): Promise<LaunchResponse> {
    // Sign the user in first, so we can record who the pending deep-link belongs
    // to (checked when they complete the deep-link form).
    const signIn = await this.ltiSignInService.signInLti(
      launch,
      this.lms.interpretLaunch(launch).isInstructor
    )

    // Persist only the fields the deep-link response is built from (see
    // LtiDeepLinkingService.handleDeepLink), not the whole id_token.
    const settings = launch[CLAIM_DEEP_LINKING_SETTINGS]
    const context = launch[CLAIM_CUSTOM].modulus_deep_link_context

    const launch_id = uuidv7()
    await this.ltiMutations.insertPendingDeepLink({
      id: launch_id,
      user_id: signIn.user.id,
      issuer: launch.iss,
      deployment_id: launch[CLAIM_DEPLOYMENT_ID],
      deep_linking_data: settings.data != null ? String(settings.data) : null,
      return_url: settings.deep_link_return_url,
      context: typeof context === 'string' ? context : null,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 1),
    })

    const tokens = await this.tokens.createTokens(signIn)

    return {
      type: 'deep-link',
      launch_id: launch_id,
      tokens,
    }
  }

  private async handleDashboardLaunch(launch: ResourceLinkLaunchRequest): Promise<LaunchResponse> {
    const signIn = await this.ltiSignInService.signInLti(
      launch,
      this.lms.interpretLaunch(launch).isInstructor
    )
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
  private async validateLaunch({ id_token, issuer }: LaunchRequest): Promise<VerifiedLaunch> {
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

    // TODO: Any other validations that apply to all LtiMessages?

    // Verify that the launch nonce is valid and unused.  claimNonce atomically
    // marks the nonce used only if it currently exists and is unused, so two
    // concurrent replays of the same id_token cannot both pass.
    const nonceClaimed = await this.ltiMutations.claimNonce(launch.nonce)
    if (!nonceClaimed) {
      throw ERR_INVALID_LAUNCH({
        message: 'lti launch nonce invalid or already used',
      }).log(this.logger)
    }

    return { launch, platform }
  }
}
