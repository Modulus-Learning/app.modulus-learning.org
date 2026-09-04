import { BaseService, method } from '@/lib/base-service.js'
import type { AgentAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { PolicySnapshot } from '@/modules/activity-registration/schemas.js'
import type { ActivityRegistrationService } from '@/modules/activity-registration/services/activity-registration.js'
import type {
  ActivityRecord,
  ActivityStateMutations,
  ActivityStateQueries,
} from '../repository/index.js'
import type {
  GetProgressRequest,
  GetProgressResponse,
  RejectedTarget,
  SetProgressRequest,
  SetProgressResponse,
} from '../schemas.js'

export class ActivityProgressService extends BaseService {
  private tx: TXManager
  private queries: ActivityStateQueries
  private mutations: ActivityStateMutations
  private registration: ActivityRegistrationService

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: ActivityStateQueries
    mutations: ActivityStateMutations
    activityRegistration: { service: ActivityRegistrationService }
  }) {
    super(deps.logger, 'agent', 'activity-state')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.registration = deps.activityRegistration.service
  }

  @method
  async getProgress(auth: AgentAuth, request: GetProgressRequest): Promise<GetProgressResponse> {
    const selfRecord = await this.queries.getProgress(auth.user_id, auth.activity_id, auth.scope_id)
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
    const record = await this.queries.getProgress(auth.user_id, target.id, auth.scope_id)
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
        scope_id: auth.scope_id,
        progress: request.progress_for_current_page,
      })

      if (self.updated) {
        await this.mutations.recordProgressEvent({
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          scope_id: auth.scope_id,
          progress: self.progress,
          submitted_at: self.updated_at,
        })

        const lineItemResult = await this.mutations.updateLineItems({
          user_id: auth.user_id,
          activity_id: auth.activity_id,
          scope_id: auth.scope_id,
          progress: self.progress,
          submitted_at: self.updated_at,
        })
        this.logLineItemScopeMismatch(auth, auth.activity_id, lineItemResult.scope_mismatch)
      }

      // 2. Cumulative targets: each receives Δself × factor.  Because Δself is
      // the observed advance of the idempotent high-water mark, a retry (where
      // the mark doesn't move) contributes nothing -- so the umbrella update
      // inherits self's idempotency.  Nothing to do when self didn't advance.
      //
      // A refused target never fails this submission. The target list comes
      // from the page's authored markup, so the same bad URL recurs in every
      // submission that page makes: failing the request would not cost one
      // update, it would permanently stop all progress from that page --
      // including the learner's own valid self high-water mark, which has
      // already committed above.
      const others: { url: string; progress: number }[] = []
      const rejected: RejectedTarget[] = []

      if (self.increase > 0) {
        // One snapshot for every target in the submission, read once outside
        // the loop so the whole list is decided coherently.
        const policy = await this.registration.loadPolicy()

        for (const { url, factor } of request.increments_for_other_pages) {
          const target = await this.resolveTarget(auth, url, policy)

          if (!target.ok) {
            rejected.push({ url, reason: target.reason })
            continue
          }

          others.push(
            await this.applyContribution(auth, target.activity, url, self.increase * factor)
          )
        }
      }

      return {
        progress: self.progress,
        others: others.length > 0 ? others : undefined,
        rejected_targets: rejected.length > 0 ? rejected : undefined,
      }
    })
  }

  // Apply a single cumulative contribution to a target activity the caller has
  // already resolved and admitted -- `resolveTarget` owns both, so by the time
  // a target reaches here it exists and the sitewide allowlist has accepted it.
  //
  // Records a contribution event and touches line items only when the target's
  // high-water mark actually advanced.
  //
  // There is no activity-code scope check: codes are orthogonal to umbrella
  // reporting. Modulus stores no page->page relationship either, so the target
  // list in each submission is the only statement of where a page reports --
  // which is why a refused target is reported back rather than silently
  // dropped, and why the allowlist, not the page's author, decides whether an
  // unseen target may be registered at all.
  private async applyContribution(
    auth: AgentAuth,
    target: ActivityRecord,
    url: string,
    amount: number
  ): Promise<{ url: string; progress: number }> {
    const result = await this.mutations.incrementProgress({
      activity_id: target.id,
      user_id: auth.user_id,
      scope_id: auth.scope_id,
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
        scope_id: auth.scope_id,
        source_activity_id: auth.activity_id,
        progress: result.progress,
        submitted_at: result.updated_at,
      })

      const lineItemResult = await this.mutations.updateLineItems({
        user_id: auth.user_id,
        activity_id: target.id,
        scope_id: auth.scope_id,
        progress: result.progress,
        submitted_at: result.updated_at,
      })
      this.logLineItemScopeMismatch(auth, target.id, lineItemResult.scope_mismatch)
    }

    return { url, progress: result.progress }
  }

  /**
   * Resolves an umbrella target URL to an activity, admitting it through the
   * shared registration service if Modulus has not seen it before.
   *
   * Returns a refusal rather than throwing. The two authoring errors that used
   * to fail the whole request -- an over-long URL and a self-reference -- are
   * now per-target outcomes, because a page misconfigured in either way would
   * otherwise be unable to report *any* progress, ever.
   *
   * Self-reference is compared by activity id, not by URL string: `register`
   * resolves the URL to a row first, and a self-referencing URL always resolves
   * to an existing row, since self's own activity was created when its token
   * was minted. Nothing is created on the way to that refusal.
   */
  private async resolveTarget(
    auth: AgentAuth,
    url: string,
    policy: PolicySnapshot
  ): Promise<
    { ok: true; activity: ActivityRecord } | { ok: false; reason: RejectedTarget['reason'] }
  > {
    const outcome = await this.registration.register(url, policy)

    if (!outcome.ok) {
      // Nothing was created: no activity, and so no progress row, no event and
      // no line-item update downstream.
      return { ok: false, reason: outcome.reason }
    }

    if (outcome.activity.id === auth.activity_id) {
      // The page names itself. This caller owns the check because it is the
      // only one that knows which activity is reporting.
      this.logger.warn(
        { source: auth.activity_id },
        'umbrella target is the reporting activity itself (self-reference)'
      )
      return { ok: false, reason: 'self_reference' }
    }

    return { ok: true, activity: outcome.activity }
  }

  private logLineItemScopeMismatch(
    auth: AgentAuth,
    activity_id: string,
    scope_mismatch: boolean
  ): void {
    if (scope_mismatch) {
      this.logger.warn(
        { activity_id, scope_id: auth.scope_id },
        'progress scope does not match live line item'
      )
    }
  }
}
