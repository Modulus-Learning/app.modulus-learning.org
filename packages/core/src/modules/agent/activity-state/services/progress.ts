import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNHANDLED, ERR_VALIDATION } from '@/lib/errors.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type {
  ActivityRecord,
  ActivityStateMutations,
  ActivityStateQueries,
} from '../repository/index.js'
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

    // Additional activities (by URL) requested alongside self -- e.g. a
    // cumulative page reading the activities that report into it.  Unknown URLs
    // are omitted from the result.
    const urls = request.urls ?? []
    const others = (
      await Promise.all(urls.map((url) => this.readScopedProgress(auth, url)))
    ).filter((entry): entry is { url: string; progress: number } => entry != null)

    return { progress, others: others.length > 0 ? others : undefined }
  }

  // Resolve a URL to an activity and return its progress.  Reads are
  // side-effect-free: an unknown URL is omitted (returns null) -- the agent
  // renders a missing entry as 0 -- and we never create a row on the read path.
  // No activity-code scope check: codes are orthogonal to umbrella reporting.
  private async readScopedProgress(
    auth: AgentAuth,
    url: string
  ): Promise<{ url: string; progress: number } | null> {
    const target = await this.queries.findActivityByUrl(url)
    if (!target) {
      return null
    }
    const record = await this.queries.getProgress(auth.user_id, target.id)
    return { url, progress: record?.progress ?? 0 }
  }

  @method
  async setProgress(auth: AgentAuth, request: SetProgressRequest): Promise<SetProgressResponse> {
    return await this.tx.withTransaction(async () => {
      // 0. Serialize all of this learner's progress writes for the duration of
      // the transaction.  Without this, two concurrent set-progress requests for
      // the same user with overlapping targets in differing order can deadlock
      // on the target row locks.  Keyed by user_id only -- contention is
      // per-learner (effectively nil), and cross-user traffic never contends.
      await this.mutations.acquireUserLock(auth.user_id)

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

        await this.mutations.updateLineItems({
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
          others.push(await this.applyContribution(auth, url, self.increase * factor))
        }
      }

      return { progress: self.progress, others: others.length > 0 ? others : undefined }
    })
  }

  // Apply a single cumulative contribution to a target activity addressed by
  // URL.  The target is created on first contact if Modulus hasn't seen the URL
  // (the author is authoritative about which pages a lesson reports into --
  // Modulus stores no page->page relationship).  There is no activity-code scope
  // check: codes are orthogonal to umbrella reporting.
  private async applyContribution(
    auth: AgentAuth,
    url: string,
    amount: number
  ): Promise<{ url: string; progress: number }> {
    const target = await this.resolveTarget(auth, url)

    const result = await this.mutations.incrementProgress({
      activity_id: target.id,
      user_id: auth.user_id,
      amount,
    })

    // Only record a contribution event / touch line items when the target's
    // high-water mark actually advanced -- a clamped no-op (0 amount, or a target
    // already at the cap) leaves the world unchanged and shouldn't log or nudge
    // passback.
    if (result.increased) {
      await this.mutations.recordProgressEvent({
        user_id: auth.user_id,
        activity_id: target.id,
        source_activity_id: auth.activity_id,
        progress: result.progress,
        submitted_at: result.updated_at,
      })

      await this.mutations.updateLineItems({
        user_id: auth.user_id,
        activity_id: target.id,
        progress: result.progress,
        submitted_at: result.updated_at,
      })
    }

    return { url, progress: result.progress }
  }

  // Resolve an umbrella target URL to an activity, lazy-creating it if unseen.
  // Rejects two static authoring errors (the page is misconfigured and will fail
  // identically every submission, so we fail the whole request rather than
  // silently repair it): an over-long URL that can't be stored, and a
  // self-referencing target.  Self always exists as an activity (its token was
  // minted against it), so a URL that resolves to `auth.activity_id` is the page
  // naming itself -- checked before create so we never create-then-roll-back.
  private async resolveTarget(auth: AgentAuth, url: string): Promise<ActivityRecord> {
    if (url.length > 255) {
      throw ERR_VALIDATION({
        message: 'umbrella target URL exceeds the 255-character limit',
        logExtra: { source: auth.activity_id, url },
      }).log(this.logger)
    }

    const existing = await this.queries.findActivityByUrl(url)
    if (existing) {
      if (existing.id === auth.activity_id) {
        throw ERR_VALIDATION({
          message: 'umbrella target is the reporting activity itself (self-reference)',
          logExtra: { source: auth.activity_id, url },
        }).log(this.logger)
      }
      return existing
    }

    const created = await this.mutations.createActivity({ url })
    if (created) {
      return created
    }

    // Lost a concurrent create race (another user created the same target URL
    // between our miss and our insert); re-resolve the winning row.
    const raced = await this.queries.findActivityByUrl(url)
    if (!raced) {
      throw ERR_UNHANDLED({
        message: 'umbrella target activity missing after create race',
        logExtra: { source: auth.activity_id, url },
      }).log(this.logger)
    }
    return raced
  }
}
