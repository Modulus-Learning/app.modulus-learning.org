import { BaseService, method } from '@/lib/base-service.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'

/**
 * The result of an enrollment attempt. Callers ignore this today -- both
 * triggers honour their launch regardless -- but returning it lets tests assert
 * behaviour directly rather than scraping logs.
 */
export type EnrollmentOutcome =
  | { status: 'enrolled'; activity_code_id: string }
  | {
      status: 'skipped'
      reason: 'unknown_activity_code' | 'activity_not_in_activity_code'
    }

/**
 * The single writer of activity-code enrollment.
 *
 * An enrollment answers exactly one question: which activity codes a learner is
 * enrolled under. It carries no activity, no scope, and no lifecycle flag. The
 * `activity_id` these methods take is eligibility context only -- it decides
 * *whether* to enroll, and is never stored.
 *
 * Both triggers -- a verified LTI resource-link launch and `startActivity` --
 * route through here so that one code path performs the association check, the
 * conflict-tolerant insert, and the diagnostics. Eligibility is always decided
 * from the canonical records core resolves itself, never from a client-supplied
 * relationship.
 *
 * Only the two defined eligibility conditions skip quietly. An unexpected
 * database failure is a real fault and propagates to the caller, already
 * classified by `wrapDbErrorNew` in the repository.
 */
export class EnrollmentService extends BaseService {
  private queries: ActivityQueries
  private mutations: ActivityMutations

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityQueries
    mutations: ActivityMutations
  }) {
    super(deps.logger, 'app', 'activities')
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  /**
   * Enrolls a learner in an activity code that the caller has already resolved
   * to a canonical record. Used by `startActivity`, which owns the not-found
   * error for its own request path.
   */
  @method
  async enrollByActivityCodeId({
    user_id,
    activity_code_id,
    activity_id,
  }: {
    user_id: string
    activity_code_id: string
    activity_id: string
  }): Promise<EnrollmentOutcome> {
    const associated = await this.queries.isActivityInActivityCode(activity_code_id, activity_id)
    if (!associated) {
      // A removed association honours the link and skips enrollment. It must
      // not restore the association, invent one, or fail the launch.
      this.logger.warn(
        { activity_code_id, activity_id },
        'enrollment skipped: activity not associated with activity code'
      )
      return { status: 'skipped', reason: 'activity_not_in_activity_code' }
    }

    await this.mutations.enrollInActivityCode(user_id, activity_code_id)

    return { status: 'enrolled', activity_code_id }
  }

  /**
   * Enrolls a learner in an activity code named only by its public code string.
   * Used by the LTI resource-link launch, which must tolerate a code that no
   * longer resolves: an unresolvable code leaves the launch response unchanged.
   */
  @method
  async enrollByPublicActivityCode({
    user_id,
    activity_code,
    activity_id,
  }: {
    user_id: string
    activity_code: string
    activity_id: string
  }): Promise<EnrollmentOutcome> {
    const activityCode = await this.queries.findActivityCodeByPublicCode(activity_code)
    if (activityCode == null) {
      this.logger.warn(
        { activity_code, activity_id },
        'enrollment skipped: activity code not found'
      )
      return { status: 'skipped', reason: 'unknown_activity_code' }
    }

    return await this.enrollByActivityCodeId({
      user_id,
      activity_code_id: activityCode.id,
      activity_id,
    })
  }
}
