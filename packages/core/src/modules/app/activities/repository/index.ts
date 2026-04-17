import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodes,
  enrollment,
  progress,
  users,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'
import type { ProgressRequest } from '../schemas.js'

// TODO: Add Update types?
export type ActivityRecord = typeof activities.$inferSelect
export type ActivityInsert = typeof activities.$inferInsert
// export type ActivityUpdate = Partial<Omit<ActivityRecord, 'id' | 'created_at'>>

export type ActivityCodeRecord = typeof activityCodes.$inferSelect
export type ActivityCodeInsert = typeof activityCodes.$inferInsert

export type UserRecord = typeof users.$inferSelect

export type ProgressRecord = typeof progress.$inferSelect

export class ActivityQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'activities')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getUser(user_id: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({ where: eq(users.id, user_id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async listActivityCodesByOwner(user_id: string): Promise<ActivityCodeRecord[]> {
    return await this.db
      .get()
      .query.activityCodes.findMany({
        where: eq(activityCodes.user_id, user_id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivityCodeByPublicCode(code: string): Promise<ActivityCodeRecord | undefined> {
    return await this.db
      .get()
      .query.activityCodes.findFirst({ where: eq(activityCodes.code, code) })
  }

  @method
  async findActivityCodeById(id: string): Promise<ActivityCodeRecord | undefined> {
    return await this.db
      .get()
      .query.activityCodes.findFirst({
        where: eq(activityCodes.id, id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivityCodeByPrivateCode(
    private_code: string
  ): Promise<ActivityCodeRecord | undefined> {
    return await this.db
      .get()
      .query.activityCodes.findFirst({
        where: eq(activityCodes.private_code, private_code.toLowerCase()),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async listActivitiesByActivityCodeId(activity_code_id: string): Promise<ActivityRecord[]> {
    return await this.db
      .get()
      .select({ ...getTableColumns(activities) })
      .from(activities)
      .innerJoin(activityActivityCode, eq(activities.id, activityActivityCode.activity_id))
      .where(eq(activityActivityCode.activity_code_id, activity_code_id))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivityByURL(url: string): Promise<ActivityRecord | undefined> {
    return await this.db
      .get()
      .query.activities.findFirst({
        where: eq(activities.url, url),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivitiesByURL(urls: string[]): Promise<ActivityRecord[]> {
    if (urls.length === 0) {
      return []
    }

    return await this.db
      .get()
      .query.activities.findMany({ where: inArray(activities.url, urls) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getProgressForUser(
    user_id: string,
    activity_id: string
  ): Promise<ProgressRecord | undefined> {
    return await this.db
      .get()
      .query.progress.findFirst({
        where: and(eq(progress.user_id, user_id), eq(progress.activity_id, activity_id)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getActivityCodeProgress(activity_code_id: string, options: ProgressRequest['options']) {
    // TODO: Use 'query' or get rid of it
    const { page, page_size, query, order, desc: descending } = options

    const limit = page_size
    const offset = (page - 1) * page_size

    // Get the column to order by
    let orderByColumn: any
    if (order === 'full_name') {
      orderByColumn = users.full_name
    } else if (order === 'updated_at') {
      orderByColumn = progress.updated_at
    } else if (order === 'progress') {
      orderByColumn = progress.progress
    }

    return await this.db
      .get()
      .select({
        user_id: users.id,
        full_name: users.full_name,
        activity_code: activityCodes.code,
        activity_code_id: activityCodes.id,
        activity_id: activities.id,
        progress: progress.progress,
        updated_at: progress.updated_at,
        created_at: progress.created_at,
        activity_name: activities.name,
        activity_url: activities.url,
        // Total still works, despite the leftJoin below because we call
        // .groupBy(users.id) further down.
        total: sql<number>`cast(count(*) over() as int)`,
      })
      .from(enrollment)
      .innerJoin(users, eq(enrollment.user_id, users.id))
      .leftJoin(
        progress,
        and(
          eq(enrollment.activity_id, progress.activity_id),
          eq(enrollment.user_id, progress.user_id)
        )
      )
      .innerJoin(activities, eq(enrollment.activity_id, activities.id))
      .innerJoin(activityCodes, eq(enrollment.activity_code_id, activityCodes.id))
      .where(eq(activityCodes.id, activity_code_id))
      // Guarantee that ordering is deterministic.
      // TODO: Maybe consider other secondary columns based
      // on the orderBy column chosen by the user.
      .orderBy(
        descending ? desc(orderByColumn) : asc(orderByColumn),
        descending ? desc(users.id) : asc(users.id) // Secondary ordering
      )
      .limit(limit)
      .offset(offset)
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class ActivityMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'activities')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async createActivityCode(data: ActivityCodeInsert): Promise<ActivityCodeRecord> {
    const [activityCode] = await this.db
      .get()
      .insert(activityCodes)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(activityCode, { message: 'newly created activity code is null' })

    return activityCode
  }

  @method
  async updateActivityCode(
    id: string,
    data: Pick<ActivityCodeInsert, 'url_prefix'>
  ): Promise<ActivityCodeRecord> {
    const [activityCode] = await this.db
      .get()
      .update(activityCodes)
      .set({ ...data, updated_at: new Date() })
      .where(eq(activityCodes.id, id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(activityCode, { message: 'updated activity code is null' })

    return activityCode
  }

  @method
  async createActivity(data: ActivityInsert): Promise<ActivityRecord> {
    const [activity] = await this.db
      .get()
      .insert(activities)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(activity, { message: 'newly created activity is null' })

    return activity
  }

  @method
  async ensureActivitiesExist(urls: string[]): Promise<void> {
    if (urls.length > 0) {
      await this.db
        .get()
        .insert(activities)
        .values(urls.map((url) => ({ id: uuidv7(), url })))
        .onConflictDoNothing()
        .catch(this.utils.wrapDbErrorNew())
    }
  }

  @method
  async assignActivitiesToActivityCode(
    activityCode: ActivityCodeRecord,
    activities: ActivityRecord[]
  ): Promise<void> {
    if (activities.length > 0) {
      await this.db
        .get()
        .insert(activityActivityCode)
        .values(
          activities.map((activity) => ({
            activity_code_id: activityCode.id,
            activity_id: activity.id,
          }))
        )
        .onConflictDoNothing()
        .catch(this.utils.wrapDbErrorNew())
    }
  }

  @method
  async removeActivitiesFromActivityCode(activityCode: ActivityCodeRecord): Promise<void> {
    await this.db
      .get()
      .delete(activityActivityCode)
      .where(eq(activityActivityCode.activity_code_id, activityCode.id))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async enrollInActivity(
    user_id: string,
    activity_code_id: string,
    activity_id: string
  ): Promise<void> {
    await this.db
      .get()
      .insert(enrollment)
      .values({ user_id, activity_code_id, activity_id })
      .onConflictDoNothing()
      .catch(this.utils.wrapDbErrorNew())
  }
}
