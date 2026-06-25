import { and, eq, getTableColumns, gte, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  activities,
  activityActivityCode,
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

  // True if `source_id` and `target_id` are both members of (at least) one
  // common activity code -- the scope within which one activity is allowed to
  // report a cumulative contribution against another.
  @method
  async sharesActivityCode(source_id: string, target_id: string): Promise<boolean> {
    const source = alias(activityActivityCode, 'source')
    const target = alias(activityActivityCode, 'target')

    const rows = await this.db
      .get()
      .select({ one: sql`1` })
      .from(source)
      .innerJoin(target, eq(source.activity_code_id, target.activity_code_id))
      .where(and(eq(source.activity_id, source_id), eq(target.activity_id, target_id)))
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())

    return rows.length > 0
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
    const [result] = await this.db
      .get()
      .insert(progress)
      .values({
        user_id: values.user_id,
        activity_id: values.activity_id,
        progress: values.progress,
        created_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .onConflictDoUpdate({
        target: [progress.activity_id, progress.user_id],
        set: {
          progress: sql`GREATEST(${values.progress}, ${progress.progress})`,
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
  // is the caller-computed Δself × factor.
  @method
  async incrementProgress(values: {
    activity_id: string
    user_id: string
    amount: number
  }): Promise<ProgressRecord> {
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
        target: [progress.activity_id, progress.user_id],
        set: {
          progress: sql`LEAST(1.0, ${progress.progress} + ${values.amount})`,
          updated_at: sql`NOW()`,
        },
      })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'incremented progress record is null' })

    return result
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
        target: [pageState.activity_id, pageState.user_id],
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
