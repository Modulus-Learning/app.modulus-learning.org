import { BaseService, method } from '@/lib/base-service.js'
import {
  ERR_ACTIVITY_CODE_NOT_FOUND,
  ERR_ACTIVITY_NOT_FOUND,
  ERR_LEARNER_NOT_FOUND,
} from '../errors.js'
import type { Config } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'
import type { StartActivityRequest, StartActivityResponse } from '../schemas.js'

export class StartActivityService extends BaseService {
  private config: Config
  private queries: ActivityQueries
  private mutations: ActivityMutations

  constructor(deps: {
    logger: CoreLogger
    config: Config
    queries: ActivityQueries
    mutations: ActivityMutations
  }) {
    super(deps.logger, 'app', 'activities')
    this.config = deps.config
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async startActivity(
    userAuth: UserAuth,
    { activity_code, activity_url }: StartActivityRequest
  ): Promise<StartActivityResponse> {
    const user = await this.queries.getUser(userAuth.id)
    if (user == null) {
      throw ERR_LEARNER_NOT_FOUND({
        message: 'learner not found',
      }).log(this.logger)
    }

    const activityCode = await this.queries.findActivityCodeByPublicCode(activity_code)
    if (activityCode == null) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found',
      }).log(this.logger)
    }

    const activity = await this.queries.findActivityByURL(activity_url)
    if (activity == null) {
      throw ERR_ACTIVITY_NOT_FOUND({
        message: 'activity not found',
      }).log(this.logger)
    }

    // TODO: Check that the activity is associated with the activity_code.

    await this.mutations.enrollInActivity(user.id, activityCode.id, activity.id)

    return {
      user: {
        id: user.id,
        full_name: user.full_name ?? undefined,
      },
      activity_code: {
        id: activityCode.id,
        code: activityCode.code,
      },
      activity: {
        id: activity.id,
        name: activity.name ?? undefined,
        url: activity.url,
      },
      modulus_server_url: this.config.server.baseUrl,
    }
  }
}
