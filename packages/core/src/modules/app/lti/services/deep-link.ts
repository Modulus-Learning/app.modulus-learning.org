import * as crypto from 'node:crypto'

import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_FORBIDDEN } from '@/lib/errors.js'
import {
  CLAIM_DEEP_LINKING_CONTENT,
  CLAIM_DEEP_LINKING_DATA,
  CLAIM_DEEP_LINKING_MSG,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_VERSION,
} from '../constants.js'
import { ERR_DEEP_LINKING } from '../errors.js'
import type { UrlBuilder } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type {
  ActivityMutations,
  ActivityQueries,
} from '@/modules/app/activities/repository/index.js'
import type { LtiQueries } from '../repository/index.js'
import type { DeepLinkRequest, DeepLinkResponse } from '../schemas.js'
import type {
  DeepLinkingContentItem,
  DeepLinkingResponse,
} from '../types/messages/tool-originating/deep-linking-response.js'

export class LtiDeepLinkingService extends BaseService {
  private urlBuilder: UrlBuilder
  private ltiQueries: LtiQueries
  private activityQueries: ActivityQueries
  private activityMutations: ActivityMutations
  private ltiKeyStore: LtiKeyStore

  constructor(deps: {
    logger: CoreLogger
    urlBuilder: UrlBuilder
    queries: LtiQueries
    activities: { queries: ActivityQueries; mutations: ActivityMutations }
    ltiKeyStore: LtiKeyStore
  }) {
    super(deps.logger, 'app', 'lti')
    this.urlBuilder = deps.urlBuilder
    this.ltiQueries = deps.queries
    this.activityQueries = deps.activities.queries
    this.activityMutations = deps.activities.mutations
    this.ltiKeyStore = deps.ltiKeyStore
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

    let activity = await this.activityQueries.findActivityByURL(activity_url)
    if (activity == null) {
      activity = await this.activityMutations.createActivity({
        id: uuidv7(),
        url: activity_url,
      })
    }

    await this.activityMutations.assignActivitiesToActivityCode(activityCodeRecord, [activity])

    const nonce = crypto.randomBytes(30).toString('base64url')

    const customFields = {
      modulus_launch_type: 'start-activity',
      modulus_activity_code: activity_code,
      modulus_activity_url: activity_url,
      ...CANVAS_CUSTOM_LAUNCH_FIELDS,
    }

    const link: DeepLinkingContentItem = {
      type: 'ltiResourceLink',
      url: this.urlBuilder.startActivityUrl(activity_code, activity_url),
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

// For now, every field that might eventually be useful is listed here;
// once things settle down, we can remove the ones that aren't being used,
// and rename the ones we are.
const CANVAS_CUSTOM_LAUNCH_FIELDS = {
  'User.id': '$User.id',
  'User.username': '$User.username',

  // Canvas doesn't include the next two
  'ActualUser.id': '$ActualUser.id',
  'ActualUser.username': '$ActualUser.username',

  'Context.id': '$Context.id',
  'Context.title': '$Context.title',
  // Canvas doesn't include the next two
  // 'Context.type': '$Context.type',
  // 'Context.label': '$Context.label',

  'ResourceLink.id': '$ResourceLink.id',
  'ResourceLink.title': '$ResourceLink.title',
  'ResourceLink.description': '$ResourceLink.description',
  'ResourceLink.available.startDateTime': '$ResourceLink.available.startDateTime',
  'ResourceLink.available.endDateTime': '$ResourceLink.available.endDateTime',
  'ResourceLink.submission.startDateTime': '$ResourceLink.submission.startDateTime',
  'ResourceLink.submission.endDateTime': '$ResourceLink.submission.endDateTime',
  // Canvas doesn't include the next four
  // 'ResourceLink.available.user.startDateTime': '$ResourceLink.available.user.startDateTime',
  // 'ResourceLink.available.user.endDateTime': '$ResourceLink.available.user.endDateTime',
  // 'ResourceLink.submission.user.startDateTime': '$ResourceLink.submission.user.startDateTime',
  // 'ResourceLink.submission.user.endDateTime': '$ResourceLink.submission.user.endDateTime',

  // Canvas-specific properties
  'Message.locale': '$Message.locale',

  'Canvas.account.id': '$Canvas.account.id',
  'Canvas.account.name': '$Canvas.account.name',
  'Canvas.user.id': '$Canvas.user.id',
  'Canvas.user.loginId': '$Canvas.user.loginId',
  'Canvas.masqueradingUser.id': '$Canvas.masqueradingUser.id',
  'Canvas.masqueradingUser.userId': '$Canvas.masqueradingUser.userId',
  'Canvas.course.id': '$Canvas.course.id',
  'Canvas.course.name': '$Canvas.course.name',
  'Canvas.course.startAt': '$Canvas.course.startAt',
  'Canvas.course.endAt': '$Canvas.course.endAt',
  'Canvas.course.gradePassbackSetting': '$Canvas.course.gradePassbackSetting',
  'Canvas.enrollment.enrollmentState': '$Canvas.enrollment.enrollmentState',
  'Canvas.module.id': '$Canvas.module.id',
  'Canvas.moduleItem.id': '$Canvas.moduleItem.id',
  'Canvas.assignment.id': '$Canvas.assignment.id',
  'Canvas.assignment.title': '$Canvas.assignment.title',
  'Canvas.assignment.description': '$Canvas.assignment.description',
  'Canvas.assignment.published': '$Canvas.assignment.published',
  'Canvas.assignment.pointsPossible': '$Canvas.assignment.pointsPossible',
  'Canvas.assignment.unlockAt.iso8601': '$Canvas.assignment.unlockAt.iso8601',
  'Canvas.assignment.lockAt.iso8601': '$Canvas.assignment.lockAt.iso8601',
  'Canvas.assignment.dueAt.iso8601': '$Canvas.assignment.dueAt.iso8601',
  'Canvas.assignment.allowedAttempts': '$Canvas.assignment.allowedAttempts',
  'Canvas.assignment.submission.studentAttempts': '$Canvas.assignment.submission.studentAttempts',

  'com.instructure.User.student_view': '$com.instructure.User.student_view',
  'com.instructure.Assignment.lti.id': '$com.instructure.Assignment.lti.id',
  'com.instructure.Assignment.description': '$com.instructure.Assignment.description',
  'com.instructure.Submission.id': '$com.instructure.Submission.id',
  'com.instructure.Context.globalId': '$com.instructure.Context.globalId',
  'com.instructure.Context.uuid': '$com.instructure.Context.uuid',
  'com.instructure.contextLabel': '$com.instructure.contextLabel',

  'vnd.instructure.Course.uuid': '$vnd.instructure.Course.uuid',
  'vnd.instructure.User.uuid': '$vnd.instructure.User.uuid',
  'vnd.instructure.User.current_uuid': '$vnd.instructure.User.current_uuid',

  'LineItem.resultValue.max': '$LineItem.resultValue.max',
}
