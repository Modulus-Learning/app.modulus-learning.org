import { BaseService, method } from '@/lib/base-service.js'
import { ERR_VALIDATION } from '@/lib/errors.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityStateMutations, ActivityStateQueries } from '../repository/index.js'
import type { GetPageStateResponse, SetPageStateRequest } from '../schemas.js'

export class ActivityPageStateService extends BaseService {
  private queries: ActivityStateQueries
  private mutations: ActivityStateMutations

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityStateQueries
    mutations: ActivityStateMutations
  }) {
    super(deps.logger, 'agent', 'activity-state')
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async getPageState(auth: AgentAuth): Promise<GetPageStateResponse> {
    const pageStateRecord = await this.queries.getPageState(
      auth.user_id,
      auth.activity_id,
      auth.scope_id
    )

    try {
      const page_state = pageStateRecord == null ? {} : JSON.parse(pageStateRecord.state)
      return { page_state }
    } catch (err) {
      // Stored state is corrupt/unparseable.  Recover by returning empty state
      // rather than failing the read, but log it so it isn't lost silently.
      this.logger.warn(
        {
          err,
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          scope_id: auth.scope_id,
        },
        'failed to parse stored page state; returning empty state'
      )
      return { page_state: {} }
    }
  }

  @method
  async setPageState(auth: AgentAuth, request: SetPageStateRequest): Promise<void> {
    // JSON.stringify can throw in some cases
    let state: string
    try {
      state = JSON.stringify(request.page_state)
    } catch (err) {
      // Unserializable page state (e.g. circular references).  This
      // should be impossible, considering that `state` will already have
      // been deserialized from the incoming request, but just to be safe...
      throw ERR_VALIDATION({
        message: 'page state is not serializable',
        cause: err,
        logExtra: {
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          scope_id: auth.scope_id,
        },
      }).log(this.logger)
    }

    await this.mutations.setPageState({
      user_id: auth.user_id,
      activity_id: auth.activity_id,
      scope_id: auth.scope_id,
      state,
    })
  }
}
