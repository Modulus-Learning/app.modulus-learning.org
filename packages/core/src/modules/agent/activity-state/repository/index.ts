import { and, eq, getTableColumns, gt, sql } from 'drizzle-orm'

import { pageState, progress, progressEvents } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type ProgressRecord = typeof progress.$inferSelect
export type ProgressUpdateRecord = ProgressRecord & { updated: boolean }
export type ProgressUpdate = Omit<typeof progress.$inferInsert, 'created_at' | 'updated_at'>

export type ProgressEventInsert = typeof progressEvents.$inferInsert
export type ProgressEventRecord = typeof progressEvents.$inferSelect

export type PageStateRecord = typeof pageState.$inferSelect
export type PageStateInsert = typeof pageState.$inferInsert
export type PageStateUpdate = Pick<Partial<PageStateInsert>, 'state'>

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
      })
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'updated progress record is null' })

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
}
