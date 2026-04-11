export class ActivityStateService {}

import { BaseService, method } from '@/lib/base-service.js'
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
    const pageStateRecord = await this.queries.getPageState(auth.user_id, auth.activity_id)

    try {
      const page_state = pageStateRecord == null ? {} : JSON.parse(pageStateRecord.state)
      return { page_state }
    } catch (_err) {
      // TODO: Log this error and/or throw a core error
      return { page_state: {} }
    }
  }

  @method
  async setPageState(auth: AgentAuth, request: SetPageStateRequest): Promise<void> {
    // JSON.stringify can throw in some cases
    let state: string
    try {
      state = JSON.stringify(request.page_state)
    } catch (_err) {
      // TODO: Log this error and/or throw a core error
      return
    }

    await this.mutations.setPageState({
      user_id: auth.user_id,
      activity_id: auth.activity_id,
      state,
    })
  }
}
