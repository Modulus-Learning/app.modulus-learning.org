import { createRemoteJWKSet, jwtVerify } from 'jose'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEEP_LINKING_SETTINGS,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_ROLES,
} from '../constants.js'
import { ERR_INVALID_LAUNCH } from '../errors.js'
import {
  type PlatformMessage,
  platformMessageSchema,
} from '../types/messages/platform-originating/platform-message.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityQueries } from '@/modules/app/activities/repository/index.js'
import type { EnrollmentService } from '@/modules/app/activities/services/enrollment.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'
import type { LtiMutations, LtiQueries, PlatformRecord } from '../repository/index.js'
import type { LaunchRequest, LaunchResponse } from '../schemas.js'
import type { DeepLinkingRequest } from '../types/messages/platform-originating/deep-linking-request.js'
import type { ResourceLinkLaunchRequest } from '../types/messages/platform-originating/resource-link-launch-request.js'

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>

type CustomFields = PlatformMessage[typeof CLAIM_CUSTOM]

type CanvasTermFieldQuality = 'missing' | 'empty' | 'unexpanded' | 'malformed' | 'usable'

type NormalizedCanvasField<T> = {
  value?: T
  quality: CanvasTermFieldQuality
}

type CanvasTermInspection = {
  term?: NormalizedCanvasTerm
  quality: {
    term_id: CanvasTermFieldQuality
    name: CanvasTermFieldQuality
    starts_at: CanvasTermFieldQuality
    ends_at: CanvasTermFieldQuality
  }
}

export type NormalizedCanvasTerm = {
  external_id: string
  name?: string
  starts_at?: Date
  ends_at?: Date
}

export type VerifiedLaunchScope = {
  scope_id: string
  scope_name: string | null
}

const canvasTermDateSchema = z.iso.datetime({ offset: true })

const inspectCanvasString = (custom: CustomFields, key: string): NormalizedCanvasField<string> => {
  const value = custom[key]
  if (value == null) {
    return { quality: 'missing' }
  }
  if (typeof value !== 'string') {
    return { quality: 'malformed' }
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return { quality: 'empty' }
  }
  if (normalized === `$${key}`) {
    return { quality: 'unexpanded' }
  }

  return { value: normalized, quality: 'usable' }
}

const inspectCanvasDate = (custom: CustomFields, key: string): NormalizedCanvasField<Date> => {
  const inspected = inspectCanvasString(custom, key)
  if (inspected.value == null) {
    return { quality: inspected.quality }
  }
  if (!canvasTermDateSchema.safeParse(inspected.value).success) {
    return { quality: 'malformed' }
  }

  return { value: new Date(inspected.value), quality: 'usable' }
}

const inspectCanvasTerm = (custom: CustomFields): CanvasTermInspection => {
  const externalId = inspectCanvasString(custom, 'Canvas.term.id')
  const name = inspectCanvasString(custom, 'Canvas.term.name')
  const startsAt = inspectCanvasDate(custom, 'Canvas.term.startAt')
  const endsAt = inspectCanvasDate(custom, 'Canvas.term.endAt')
  const quality = {
    term_id: externalId.quality,
    name: name.quality,
    starts_at: startsAt.quality,
    ends_at: endsAt.quality,
  }

  if (externalId.value == null) {
    return { quality }
  }

  return {
    term: {
      external_id: externalId.value,
      name: name.value,
      starts_at: startsAt.value,
      ends_at: endsAt.value,
    },
    quality,
  }
}

export const normalizeCanvasTerm = (custom: CustomFields): NormalizedCanvasTerm | undefined =>
  inspectCanvasTerm(custom).term

type ScopeResolutionOptions = {
  verified_at?: Date
  logger?: Pick<CoreLogger, 'info'>
}

export const resolveVerifiedLaunchScope = async (
  mutations: Pick<LtiMutations, 'resolvePlatformScope'>,
  platform_id: string,
  custom: CustomFields,
  options: ScopeResolutionOptions = {}
): Promise<VerifiedLaunchScope> => {
  const { term, quality } = inspectCanvasTerm(custom)
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

  private tx: TXManager
  private ltiQueries: LtiQueries
  private ltiMutations: LtiMutations
  private activityQueries: ActivityQueries
  private enrollmentService: EnrollmentService
  private ltiSignInService: LtiSignInService
  private tokens: TokenIssuer

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: LtiQueries
    mutations: LtiMutations
    activities: { queries: ActivityQueries; enrollmentService: EnrollmentService }
    session: { ltiSignInService: LtiSignInService; tokenIssuer: TokenIssuer }
  }) {
    super(deps.logger, 'app', 'lti')
    this.tx = deps.tx
    this.ltiQueries = deps.queries
    this.ltiMutations = deps.mutations
    this.activityQueries = deps.activities.queries
    this.enrollmentService = deps.activities.enrollmentService
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
    const { launch, platform } = await this.validateLaunch(request)

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

    const scope = await resolveVerifiedLaunchScope(
      this.ltiMutations,
      platform.id,
      launch[CLAIM_CUSTOM],
      { logger: this.logger }
    )

    // Sign the user in.
    const signIn = await this.ltiSignInService.signInLti(launch, isInstructor(launch[CLAIM_ROLES]))

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
      const cutoff_at = parseDateFromArray([
        launch[CLAIM_CUSTOM]['ResourceLink.available.endDateTime'],
        launch[CLAIM_CUSTOM]['Canvas.assignment.lockAt.iso8601'],
      ])

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

    // The resolved row is the authority for both fields.  `activity.url` and
    // the `activity_url` claim agree today -- `findActivityByURL` matched on
    // that exact value -- but the redirect is built from the database column,
    // not from the claim.  `activity_code` stays in the response: enrollment
    // above still needs it and it is informative in the logs, even though
    // nothing downstream of the launch route consumes it.
    return {
      type: 'start-activity',
      activity_code,
      activity_id: activity.id,
      activity_url: activity.url,
      ...scope,
      tokens,
    }
  }

  private async handleDeepLinkLaunch(launch: DeepLinkingRequest): Promise<LaunchResponse> {
    // Sign the user in first, so we can record who the pending deep-link belongs
    // to (checked when they complete the deep-link form).
    const signIn = await this.ltiSignInService.signInLti(launch, isInstructor(launch[CLAIM_ROLES]))

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

    // Create a platform deployment record (if one doesn't already exist).
    // Deliberately done only after the nonce is claimed, so a rejected replay
    // performs no writes.
    await this.ltiMutations.upsertPlatformDeployment(issuer, launch[CLAIM_DEPLOYMENT_ID])

    return { launch, platform }
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

const parseDateFromArray = (array: any[]): Date | undefined => {
  for (const value of array) {
    if (typeof value === 'string') {
      const timestamp = Date.parse(value)
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp)
      }
    }
  }
}
