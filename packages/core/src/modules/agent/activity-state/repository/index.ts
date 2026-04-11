import { and, eq, sql } from 'drizzle-orm'

import { pageState, progress } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type ProgressRecord = typeof progress.$inferSelect
export type ProgressInsert = typeof progress.$inferInsert
export type ProgressUpdate = Pick<Partial<ProgressInsert>, 'progress' | 'updated_at'>

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
  async setProgress(values: ProgressInsert): Promise<ProgressRecord> {
    const [progressRecord] = await this.db
      .get()
      .insert(progress)
      .values(values)
      .onConflictDoUpdate({
        target: [progress.activity_id, progress.user_id],
        set: {
          progress: sql`GREATEST(${progress.progress}, ${values.progress})`,
          updated_at: values.updated_at,
        },
      })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(progressRecord, { message: 'upserted progress record is null' })

    return progressRecord
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
