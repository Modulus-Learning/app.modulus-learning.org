import { BaseService, method } from '@/lib/base-service.js'
import {
  ERR_ACTIVITY_NOT_FOUND,
  ERR_ACTIVITY_SCOPE_NOT_FOUND,
  ERR_LEARNER_NOT_FOUND,
} from '../errors.js'
import type { Config } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityQueries } from '../repository/index.js'
import type { ActivityLaunchViewRequest, ActivityLaunchViewResponse } from '../schemas.js'

/**
 * Resolves the display data behind the LTI launch interstitial, keyed on ids
 * and blind to activity codes.
 *
 * Unlike `StartActivityService` this class takes **no `EnrollmentService`**.
 * That omission is the point of it: by the time the interstitial renders,
 * `handleActivityLaunch` has already resolved the activity code and made the
 * enrollment decision, so a second pass here would duplicate the write and --
 * worse -- disagree with the first about an unresolvable code.
 *
 * Authorisation is session-only and deliberately no tighter. Requiring the
 * learner to be enrolled in a code containing the activity would fail the
 * interstitial for a launch whose activity code no longer resolves -- the exact
 * case the LTI launch handler chooses to honour.
 */
export class ActivityLaunchViewService extends BaseService {
  private config: Config
  private queries: ActivityQueries

  constructor(deps: {
    logger: CoreLogger
    config: Config
    queries: ActivityQueries
  }) {
    super(deps.logger, 'app', 'activities')
    this.config = deps.config
    this.queries = deps.queries
  }

  @method
  async getActivityLaunchView(
    userAuth: UserAuth,
    { activity_id, scope_id }: ActivityLaunchViewRequest
  ): Promise<ActivityLaunchViewResponse> {
    const user = await this.queries.getUser(userAuth.id)
    if (user == null) {
      throw ERR_LEARNER_NOT_FOUND({
        message: 'learner not found',
      }).log(this.logger)
    }

    const activity = await this.queries.findActivityById(activity_id)
    if (activity == null) {
      throw ERR_ACTIVITY_NOT_FOUND({
        message: 'activity not found',
      }).log(this.logger)
    }

    const scope = await this.queries.findScopeById(scope_id)
    if (scope == null) {
      throw ERR_ACTIVITY_SCOPE_NOT_FOUND({
        message: 'activity scope not found',
      }).log(this.logger)
    }

    return {
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
      activity: {
        id: activity.id,
        name: activity.name ?? undefined,
        url: activity.url,
      },
      scope_id: scope.id,
      scope_name: scope.name,
      modulus_server_url: this.config.server.baseUrl,
    }
  }
}
