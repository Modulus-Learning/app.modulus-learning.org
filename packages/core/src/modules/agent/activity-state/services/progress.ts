import { BaseService, method } from '@/lib/base-service.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityStateMutations, ActivityStateQueries } from '../repository/index.js'
import type {
  GetProgressRequest,
  GetProgressResponse,
  SetProgressRequest,
  SetProgressResponse,
} from '../schemas.js'

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
  async getProgress(auth: AgentAuth, request: GetProgressRequest): Promise<GetProgressResponse> {
    const selfRecord = await this.queries.getProgress(auth.user_id, auth.activity_id)
    const progress = selfRecord?.progress ?? 0

    // Additional activities (by URL) are returned only when they share an
    // activity code with the self activity -- a cumulative page reading the
    // activities that report into it.
    const urls = request.urls ?? []
    const others = (
      await Promise.all(urls.map((url) => this.readScopedProgress(auth, url)))
    ).filter((entry): entry is { url: string; progress: number } => entry != null)

    return { progress, others: others.length > 0 ? others : undefined }
  }

  // Resolve a URL to an activity, verify it shares a code with the self
  // activity, and return its progress.  Returns null (skip) for an unknown or
  // out-of-scope URL.
  private async readScopedProgress(
    auth: AgentAuth,
    url: string
  ): Promise<{ url: string; progress: number } | null> {
    const target = await this.queries.findActivityByUrl(url)
    if (!target || !(await this.queries.sharesActivityCode(auth.activity_id, target.id))) {
      return null
    }
    const record = await this.queries.getProgress(auth.user_id, target.id)
    return { url, progress: record?.progress ?? 0 }
  }

  @method
  async setProgress(auth: AgentAuth, request: SetProgressRequest): Promise<SetProgressResponse> {
    return await this.tx.withTransaction(async () => {
      // 1. Self: idempotent high-water mark, exactly as before.
      const self = await this.mutations.updateProgress({
        user_id: auth.user_id,
        activity_id: auth.activity_id,
        progress: request.progress_for_current_page,
      })

      if (self.updated) {
        await this.mutations.recordProgressEvent({
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          progress: self.progress,
          submitted_at: self.updated_at,
        })
      }

      // 2. Cumulative targets: each receives Δself × factor.  Because Δself is
      // the observed advance of the idempotent high-water mark, a retry (where
      // the mark doesn't move) contributes nothing -- so the umbrella update
      // inherits self's idempotency.  Nothing to do when self didn't advance.
      const others: { url: string; progress: number }[] = []
      if (self.increase > 0) {
        for (const { url, factor } of request.increments_for_other_pages) {
          const result = await this.applyContribution(auth, url, self.increase * factor)
          if (result) {
            others.push(result)
          }
        }
      }

      return { progress: self.progress, others: others.length > 0 ? others : undefined }
    })
  }

  // Apply a single cumulative contribution to a target activity addressed by
  // URL.  The target must already exist and share an activity code with the
  // source (self); unknown or out-of-scope targets are logged and skipped so a
  // bad authoring config never costs the learner their own (self) progress.
  private async applyContribution(
    auth: AgentAuth,
    url: string,
    amount: number
  ): Promise<{ url: string; progress: number } | null> {
    const target = await this.queries.findActivityByUrl(url)
    if (!target) {
      this.logger.warn({ source: auth.activity_id, url }, 'umbrella target not found -- skipping')
      return null
    }

    if (!(await this.queries.sharesActivityCode(auth.activity_id, target.id))) {
      this.logger.warn(
        { source: auth.activity_id, target: target.id, url },
        'umbrella target shares no activity code with source -- skipping'
      )
      return null
    }

    const result = await this.mutations.incrementProgress({
      activity_id: target.id,
      user_id: auth.user_id,
      amount,
    })

    await this.mutations.recordProgressEvent({
      user_id: auth.user_id,
      activity_id: target.id,
      source_activity_id: auth.activity_id,
      progress: result.progress,
      submitted_at: result.updated_at,
    })

    return { url, progress: result.progress }
  }
}
