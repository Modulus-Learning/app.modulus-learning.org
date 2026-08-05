import { and, eq, getTableColumns, gte, isNull, or, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  lineitems,
  pageState,
  progress,
  progressEvents,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type ActivityRecord = typeof activities.$inferSelect
export type ProgressRecord = typeof progress.$inferSelect
// `updated` is true when the high-water mark advanced (or there was no prior
// row); `increase` is the actual numeric advance (Δself) -- 0 on a no-op/retry.
export type ProgressUpdateRecord = ProgressRecord & { updated: boolean; increase: number }
// `increased` is true when the increment actually advanced the (clamped)
// high-water mark -- false for a no-op (amount 0, or an already-capped target).
export type ProgressIncrementRecord = ProgressRecord & { increased: boolean }
export type ProgressUpdate = Omit<typeof progress.$inferInsert, 'created_at' | 'updated_at'>

export type ProgressEventInsert = typeof progressEvents.$inferInsert
export type ProgressEventRecord = typeof progressEvents.$inferSelect

export type PageStateRecord = typeof pageState.$inferSelect
export type PageStateInsert = typeof pageState.$inferInsert
export type PageStateUpdate = Pick<Partial<PageStateInsert>, 'state'>

export type LineItemUpdate = {
  user_id: string
  activity_id: string
  progress: number
  submitted_at: Date
}

export class ActivityStateQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'agent', 'activity-state')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getProgress(user_id: string, activity_id: string): Promise<ProgressRecord | undefined> {
    return await this.db
      .get()
      .query.progress.findFirst({
        where: and(eq(progress.user_id, user_id), eq(progress.activity_id, activity_id)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getPageState(user_id: string, activity_id: string): Promise<PageStateRecord | undefined> {
    return await this.db
      .get()
      .query.pageState.findFirst({
        where: and(eq(pageState.user_id, user_id), eq(pageState.activity_id, activity_id)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivityByUrl(url: string): Promise<ActivityRecord | undefined> {
    return await this.db
      .get()
      .query.activities.findFirst({ where: eq(activities.url, url) })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class ActivityStateMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'agent', 'activity-state')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async updateProgress(values: ProgressUpdate): Promise<ProgressUpdateRecord> {
    const clamped = Math.min(1, Math.max(0, values.progress))
    const [result] = await this.db
      .get()
      .insert(progress)
      .values({
        user_id: values.user_id,
        activity_id: values.activity_id,
        progress: clamped,
        created_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: [progress.activity_id, progress.user_id, progress.scope_id],
        set: {
          progress: sql`GREATEST(${clamped}, ${progress.progress})`,
          updated_at: sql`NOW()`,
        },
      })
      .returning({
        ...getTableColumns(progress),
        // updated will be true if the new progress value is greater than the old one,
        // or if there _was_ no old one.
        updated: sql<boolean>`COALESCE(${progress.progress} > OLD.progress, TRUE)`,
        // increase is the actual numeric advance of the high-water mark (Δself):
        // new value minus old value, or the full new value if there was no old
        // row.  0 on a no-op (a retry or an equal/lower submission) -- this is
        // what makes cumulative contributions derived from it idempotent.
        increase: sql<number>`${progress.progress} - COALESCE(OLD.progress, 0)`,
      })
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'updated progress record is null' })

    return result
  }

  // Add `amount` to an activity's progress (the cumulative / "umbrella" target
  // write), clamped to a maximum of 1.0.  Creates the row if absent.  `amount`
  // is the caller-computed Δself × factor.  Reports `increased` so the caller can
  // skip the event/line-item writes on a no-op.
  @method
  async incrementProgress(values: {
    activity_id: string
    user_id: string
    amount: number
  }): Promise<ProgressIncrementRecord> {
    const [result] = await this.db
      .get()
      .insert(progress)
      .values({
        user_id: values.user_id,
        activity_id: values.activity_id,
        progress: Math.min(1, Math.max(0, values.amount)),
        created_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: [progress.activity_id, progress.user_id, progress.scope_id],
        set: {
          // Clamp both ends: the upper bound is the cumulative cap, and the
          // lower bound keeps a garbage/negative amount from *decreasing* an
          // existing target (which would break its monotonicity).  With a
          // clamped factor and Δself ≥ 0 the lower clamp is unreachable in
          // normal operation -- it is defense-in-depth.
          progress: sql`LEAST(1.0, GREATEST(0, ${progress.progress} + ${values.amount}))`,
          updated_at: sql`NOW()`,
        },
      })
      .returning({
        ...getTableColumns(progress),
        // True when the resulting (clamped) value exceeds what was there before
        // -- new value > old value, or, for a freshly-created row, > 0.  False on
        // a no-op (a 0 amount, or a target already at the cap).
        increased: sql<boolean>`${progress.progress} > COALESCE(OLD.progress, 0)`,
      })
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'incremented progress record is null' })

    return result
  }

  // Lazy-create a bare `activities` row for a URL Modulus hasn't seen before (an
  // umbrella target named by an authored page).  No activity-code association --
  // codes are orthogonal to umbrella reporting.  Safe against a concurrent create
  // of the same URL by another user: on the unique-`url` conflict we do nothing
  // and return undefined, leaving the caller to re-resolve the winning row.
  @method
  async createActivity(values: {
    url: string
    name?: string
  }): Promise<ActivityRecord | undefined> {
    const [result] = await this.db
      .get()
      .insert(activities)
      .values({ id: uuidv7(), url: values.url, name: values.name ?? null })
      .onConflictDoNothing({ target: activities.url })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return result
  }

  // Serialize all progress writes for a single learner within the current
  // transaction.  Prevents the deadlock where two concurrent set-progress
  // requests for one user acquire overlapping target row locks in opposing
  // order.  Keyed only by user_id, so cross-user traffic never contends (barring
  // benign hash collisions).  Must be called inside `withTransaction` so the
  // lock rides -- and releases with -- the transaction.
  @method
  async acquireUserLock(user_id: string): Promise<void> {
    await this.db
      .get()
      .execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user_id}, 0))`)
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async recordProgressEvent(values: ProgressEventInsert) {
    await this.db.get().insert(progressEvents).values(values).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async setPageState(values: PageStateInsert): Promise<void> {
    await this.db
      .get()
      .insert(pageState)
      .values(values)
      .onConflictDoUpdate({
        target: [pageState.user_id, pageState.activity_id, pageState.scope_id],
        set: { state: values.state },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async updateLineItems({
    user_id,
    activity_id,
    submitted_at,
    progress,
  }: LineItemUpdate): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set({
        submittable_progress: sql`GREATEST(${lineitems.submittable_progress}, ${progress})`,
        submission_eligible_at: sql`
          CASE WHEN ${lineitems.submittable_progress} > ${lineitems.submitted_progress}
          THEN COALESCE(${lineitems.submission_eligible_at}, now())
          ELSE GREATEST(${lineitems.submission_eligible_at}, now()) END`,
        updated_at: sql`now()`,
      })
      .where(
        and(
          eq(lineitems.user_id, user_id),
          eq(lineitems.activity_id, activity_id),
          or(isNull(lineitems.cutoff_at), gte(lineitems.cutoff_at, submitted_at)),
          isNull(lineitems.dead_at)
        )
      )
      .catch(this.utils.wrapDbErrorNew())
  }
}
