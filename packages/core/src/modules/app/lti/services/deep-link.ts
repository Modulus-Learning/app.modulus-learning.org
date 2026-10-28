import * as crypto from 'node:crypto'

import type { DeepLinkingContentItem, DeepLinkingResponse, LmsAdapter } from '@modulus-learning/lti'
import {
  CLAIM_DEEP_LINKING_CONTENT,
  CLAIM_DEEP_LINKING_DATA,
  CLAIM_DEEP_LINKING_MSG,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_VERSION,
} from '@modulus-learning/lti'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_FORBIDDEN } from '@/lib/errors.js'
import { activityUrlNotAllowed } from '@/modules/activity-registration/errors.js'
import { ERR_DEEP_LINKING } from '../errors.js'
import type { UrlBuilder } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { ActivityRegistrationService } from '@/modules/activity-registration/services/activity-registration.js'
import type {
  ActivityMutations,
  ActivityQueries,
} from '@/modules/app/activities/repository/index.js'
import type { LtiQueries } from '../repository/index.js'
import type { DeepLinkRequest, DeepLinkResponse } from '../schemas.js'

export class LtiDeepLinkingService extends BaseService {
  private urlBuilder: UrlBuilder
  private ltiQueries: LtiQueries
  private activityQueries: ActivityQueries
  private activityMutations: ActivityMutations
  private ltiKeyStore: LtiKeyStore
  private registration: ActivityRegistrationService
  private lms: LmsAdapter

  constructor(deps: {
    logger: CoreLogger
    urlBuilder: UrlBuilder
    queries: LtiQueries
    activities: { queries: ActivityQueries; mutations: ActivityMutations }
    ltiKeyStore: LtiKeyStore
    activityRegistration: { service: ActivityRegistrationService }
    lmsAdapter: LmsAdapter
  }) {
    super(deps.logger, 'app', 'lti')
    this.urlBuilder = deps.urlBuilder
    this.ltiQueries = deps.queries
    this.activityQueries = deps.activities.queries
    this.activityMutations = deps.activities.mutations
    this.ltiKeyStore = deps.ltiKeyStore
    this.registration = deps.activityRegistration.service
    this.lms = deps.lmsAdapter
  }

  @method
  async handleDeepLink(
    userAuth: UserAuth,
    { launch_id, activity_code_id, activity_url }: DeepLinkRequest
  ): Promise<DeepLinkResponse> {
    // NOTE: When an instructor submits the deep linking form we ensure the
    // activity exists and associate it with the given activity code here, so
    // that newly-entered URLs are registered against the code immediately.
    // Caveat: this method returns an LTI link which the platform shows to the
    // instructor, and they still have a chance to cancel before the link is
    // actually created on the LTI platform.  The LTI platform does not tell us
    // about cancellations, so in that case we will have associated an activity
    // with the code that is never used.  This is preferable to losing the
    // association entirely, and the join is idempotent on re-submission.

    const pending = await this.ltiQueries.findPendingDeepLink(launch_id)
    if (pending == null) {
      throw ERR_DEEP_LINKING({
        message: 'deep-link launch not found',
      }).log(this.logger)
    }

    // The caller must be the instructor who initiated this deep-link launch.
    if (pending.user_id !== userAuth.id) {
      throw ERR_FORBIDDEN({
        message: 'deep-link launch belongs to a different user',
        logExtra: { launch_id, user_id: userAuth.id },
      }).log(this.logger)
    }

    if (pending.expires_at < new Date()) {
      throw ERR_DEEP_LINKING({
        message: 'deep-link launch has expired',
      }).log(this.logger)
    }

    const platform = await this.ltiQueries.findPlatformByIssuer(pending.issuer)
    if (platform == null) {
      throw ERR_DEEP_LINKING({
        message: 'platform not found',
      }).log(this.logger)
    }

    const activityCodeRecord = await this.activityQueries.findActivityCodeById(activity_code_id)
    if (activityCodeRecord == null) {
      throw ERR_DEEP_LINKING({
        message: 'activity code not found',
      }).log(this.logger)
    }

    // The caller must be a member of the activity code they are linking to.
    const isMember = await this.activityQueries.isMember(activity_code_id, userAuth.id)
    if (!isMember) {
      throw ERR_FORBIDDEN({
        message: 'not a member of this activity code',
        logExtra: { activity_code_id, user_id: userAuth.id },
      }).log(this.logger)
    }

    // Build the durable launch URL from the code's canonical public code rather
    // than a client-supplied string.
    const activity_code = activityCodeRecord.code

    if (
      activityCodeRecord.url_prefix != null &&
      activityCodeRecord.url_prefix.length > 0 &&
      !activity_url.startsWith(activityCodeRecord.url_prefix)
    ) {
      throw ERR_DEEP_LINKING({
        message: `activity url must start with ${activityCodeRecord.url_prefix}`,
      }).log(this.logger)
    }

    // Deep linking is the same admission as the activity-code edit page and
    // must use the same policy -- otherwise an instructor bypasses the
    // creation gate by typing an unseen disallowed URL into Canvas. Routing it
    // through the registration service also fixes its create race: two
    // instructors deep linking the same new URL at the same moment currently
    // surface a unique-constraint error.
    //
    // This runs *after* the per-code prefix check above, and that order is not
    // arbitrary: a known grandfathered activity skips the sitewide check but
    // still has to satisfy the prefix, which is an independent,
    // instructor-managed curriculum constraint.
    const policy = await this.registration.loadPolicy()
    const outcome = await this.registration.register(activity_url, policy)

    if (!outcome.ok) {
      // Raised before the content item is built, so no signed content item
      // reaches Canvas for a URL Modulus will not accept.
      //
      // Not `.log()`ed: `details.rejected` carries the whole URL, query and
      // fragment included, and `CoreError.log()` spreads `details` into the
      // record. `register()` has already logged the denial with its normalized
      // origin and path alone.
      this.logger.warn({ reason: outcome.reason }, 'deep link denied by the activity url allowlist')
      throw activityUrlNotAllowed([{ url: outcome.url, reason: outcome.reason }])
    }

    const activity = outcome.activity

    // Deliberately unguarded. Linking a grandfathered activity into a new
    // Canvas context is a consequence of admission being activity-level, not
    // an oversight: association is categorization, never a trust decision.
    await this.activityMutations.assignActivitiesToActivityCode(activityCodeRecord, [activity])

    const nonce = crypto.randomBytes(30).toString('base64url')

    // The adapter's fields first, then Modulus's own: a vendor field can never
    // overwrite the resource identity the launch reads.
    const customFields = {
      ...this.lms.deepLinkCustomFields(),
      modulus_launch_type: 'start-activity',
      modulus_activity_code: activity_code,
      modulus_activity_url: activity_url,
    }

    const link: DeepLinkingContentItem = {
      type: 'ltiResourceLink',
      // The tool's launch endpoint, not a per-activity URL. This becomes the
      // resource link's `target_link_uri`, which LTI 1.3 defines as the
      // end-point executed at the end of the OIDC flow -- an endpoint that
      // receives a POST, not a page a browser opens.
      //
      // A per-activity URL would be wrong here on three counts: the resource
      // identity already travels in the custom claims below, which is what
      // `handleActivityLaunch` reads; under the default `never` interstitial
      // mode there is no per-activity Modulus page for it to name; and a scope
      // baked into a durable link would go stale, since the scope is resolved
      // from the term claims on every launch precisely so a link survives into
      // a new term.
      url: this.urlBuilder.ltiLaunchUrl,
      // title: undefined,
      // text: undefined,
      window: { targetName: `modulus-${activity_code}-${activity_url}` },
      custom: customFields,
    }

    const message = pending.context === 'assignment' ? 'Assignment configured!' : 'Link configured!'

    const response: DeepLinkingResponse = {
      iss: platform.client_id,
      aud: platform.issuer,
      nonce,
      [CLAIM_MESSAGE_TYPE]: 'LtiDeepLinkingResponse',
      [CLAIM_VERSION]: '1.3.0',
      [CLAIM_DEPLOYMENT_ID]: pending.deployment_id,
      [CLAIM_DEEP_LINKING_DATA]: pending.deep_linking_data ?? undefined,
      [CLAIM_DEEP_LINKING_CONTENT]: [link],
      [CLAIM_DEEP_LINKING_MSG]: message,
    }

    const jwt = await this.ltiKeyStore.signPlatformMessage(response)

    return { jwt, return_url: pending.return_url }
  }
}
