import { BaseService, method } from '@/lib/base-service.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { LtiScorePassbackService } from '@/modules/app/lti/services/score-passback.js'
import type { ActivityStateMutations, ActivityStateQueries } from '../repository/index.js'
import type { GetProgressResponse, SetProgressRequest, SetProgressResponse } from '../schemas.js'

export class ActivityProgressService extends BaseService {
  private queries: ActivityStateQueries
  private mutations: ActivityStateMutations
  private scorePassbackService: LtiScorePassbackService

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityStateQueries
    mutations: ActivityStateMutations
    app: { lti: { scorePassbackService: LtiScorePassbackService } }
  }) {
    super(deps.logger, 'agent', 'activity-state')
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.scorePassbackService = deps.app.lti.scorePassbackService
  }

  @method
  async getProgress(auth: AgentAuth): Promise<GetProgressResponse> {
    const progressRecord = await this.queries.getProgress(auth.user_id, auth.activity_id)
    return { progress: progressRecord?.progress ?? 0 }
  }

  @method
  async setProgress(auth: AgentAuth, request: SetProgressRequest): Promise<SetProgressResponse> {
    const now = new Date()

    const progressRecord = await this.mutations.setProgress({
      user_id: auth.user_id,
      activity_id: auth.activity_id,
      progress: request.progress,
      created_at: now,
      updated_at: now,
    })

    await this.scorePassbackService.submitAllScores(
      auth.user_id,
      auth.activity_id,
      progressRecord.progress
    )

    return {
      progress: progressRecord.progress,
    }
  }
}
