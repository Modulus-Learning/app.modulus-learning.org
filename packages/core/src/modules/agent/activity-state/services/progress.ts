import { BaseService, method } from '@/lib/base-service.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityStateMutations, ActivityStateQueries } from '../repository/index.js'
import type { GetProgressResponse, SetProgressRequest, SetProgressResponse } from '../schemas.js'

export class ActivityProgressService extends BaseService {
  private tx: TXManager
  private queries: ActivityStateQueries
  private mutations: ActivityStateMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: ActivityStateQueries
    mutations: ActivityStateMutations
  }) {
    super(deps.logger, 'agent', 'activity-state')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async getProgress(auth: AgentAuth): Promise<GetProgressResponse> {
    const progressRecord = await this.queries.getProgress(auth.user_id, auth.activity_id)
    return { progress: progressRecord?.progress ?? 0 }
  }

  @method
  async setProgress(auth: AgentAuth, request: SetProgressRequest): Promise<SetProgressResponse> {
    return await this.tx.withTransaction(async () => {
      const result = await this.mutations.updateProgress({
        user_id: auth.user_id,
        activity_id: auth.activity_id,
        progress: request.progress,
      })

      // TODO: Do we want / need this test?  We could just blindly
      // record all progress events.
      if (result.updated) {
        await this.mutations.recordProgressEvent({
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          progress: request.progress,
          submitted_at: result.updated_at,
        })
      }

      return {
        progress: result.progress,
      }
    })
  }
}
