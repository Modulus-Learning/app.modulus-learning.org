import {
  and,
  asc,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  max,
  min,
  notExists,
  or,
  sql,
} from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  activityActivityCode,
  activityCodeMember,
  activityCodes,
  enrollment,
  progress,
  roles,
  roleUser,
  scopes,
  users,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'
import type { ActivityCodeMember, InstructorSearchResult, ProgressRequest } from '../schemas.js'

const INSTRUCTOR_ROLE_MACHINE_NAME = 'instructor'

// TODO: Add Update types?
export type ActivityRecord = typeof activities.$inferSelect
export type ActivityInsert = typeof activities.$inferInsert
// export type ActivityUpdate = Partial<Omit<ActivityRecord, 'id' | 'created_at'>>

export type ActivityCodeRecord = typeof activityCodes.$inferSelect
export type ActivityCodeInsert = typeof activityCodes.$inferInsert

export type UserRecord = typeof users.$inferSelect

export type ScopeRecord = typeof scopes.$inferSelect

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
  async listActivityCodesByMember(user_id: string): Promise<ActivityCodeRecord[]> {
    return await this.db
      .get()
      .select({ ...getTableColumns(activityCodes) })
      .from(activityCodes)
      .innerJoin(activityCodeMember, eq(activityCodes.id, activityCodeMember.activity_code_id))
      .where(eq(activityCodeMember.user_id, user_id))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async isMember(activity_code_id: string, user_id: string): Promise<boolean> {
    const rows = await this.db
      .get()
      .select({ user_id: activityCodeMember.user_id })
      .from(activityCodeMember)
      .where(
        and(
          eq(activityCodeMember.activity_code_id, activity_code_id),
          eq(activityCodeMember.user_id, user_id)
        )
      )
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())
    return rows.length > 0
  }

  @method
  async listMembers(activity_code_id: string): Promise<ActivityCodeMember[]> {
    const rows = await this.db
      .get()
      .select({
        activity_code_id: activityCodeMember.activity_code_id,
        user_id: activityCodeMember.user_id,
        full_name: users.full_name,
        email: users.email,
        created_at: activityCodeMember.created_at,
      })
      .from(activityCodeMember)
      .innerJoin(users, eq(activityCodeMember.user_id, users.id))
      .where(eq(activityCodeMember.activity_code_id, activity_code_id))
      .orderBy(asc(activityCodeMember.created_at))
      .catch(this.utils.wrapDbErrorNew())

    return rows.map((row) => ({
      activity_code_id: row.activity_code_id,
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      created_at: row.created_at.toISOString(),
    }))
  }

  @method
  async searchInstructors(
    activity_code_id: string,
    query: string,
    limit: number
  ): Promise<InstructorSearchResult[]> {
    const pattern = `%${query.trim()}%`
    const alreadyMember = this.db
      .get()
      .select({ marker: sql`1` })
      .from(activityCodeMember)
      .where(
        and(
          eq(activityCodeMember.activity_code_id, activity_code_id),
          eq(activityCodeMember.user_id, users.id)
        )
      )

    return await this.db
      .get()
      .selectDistinct({
        user_id: users.id,
        full_name: users.full_name,
        email: users.email,
      })
      .from(users)
      .innerJoin(roleUser, eq(roleUser.user_id, users.id))
      .innerJoin(roles, eq(roles.id, roleUser.role_id))
      .where(
        and(
          eq(roles.machine_name, INSTRUCTOR_ROLE_MACHINE_NAME),
          query.trim().length === 0
            ? sql`true`
            : or(
                ilike(users.full_name, pattern),
                ilike(users.given_name, pattern),
                ilike(users.family_name, pattern),
                ilike(users.email, pattern)
              ),
          notExists(alreadyMember)
        )
      )
      .orderBy(asc(users.full_name))
      .limit(limit)
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async isInstructor(user_id: string): Promise<boolean> {
    const rows = await this.db
      .get()
      .select({ marker: sql`1` })
      .from(roleUser)
      .innerJoin(roles, eq(roles.id, roleUser.role_id))
      .where(
        and(eq(roleUser.user_id, user_id), eq(roles.machine_name, INSTRUCTOR_ROLE_MACHINE_NAME))
      )
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())
    return rows.length > 0
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
  async findScopeById(id: string): Promise<ScopeRecord | undefined> {
    return await this.db
      .get()
      .query.scopes.findFirst({ where: eq(scopes.id, id) })
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
  async getActivityCodeProgress(activity_code_id: string, options: ProgressRequest['options']) {
    const { page, page_size, order, desc: descending } = options

    const limit = page_size
    const offset = (page - 1) * page_size

    const enrolledInActivityCode = this.db
      .get()
      .select({ marker: sql`1` })
      .from(enrollment)
      .where(
        and(
          eq(enrollment.activity_code_id, activity_code_id),
          eq(enrollment.user_id, progress.user_id),
          eq(enrollment.activity_id, progress.activity_id)
        )
      )

    const progressByEnrollment = this.db
      .get()
      .select({
        user_id: progress.user_id,
        activity_id: progress.activity_id,
        progress: max(progress.progress).as('aggregate_progress'),
        created_at: min(progress.created_at).as('aggregate_created_at'),
        updated_at: max(progress.updated_at).as('aggregate_updated_at'),
      })
      .from(progress)
      .where(exists(enrolledInActivityCode))
      .groupBy(progress.user_id, progress.activity_id)
      .as('progress_by_enrollment')

    // Get the column to order by.  Falls back to `updated_at` (the schema
    // default) so an unmapped `order` value can never leave the column
    // undefined and hand `asc(undefined)` to Drizzle.
    const orderByColumns = {
      full_name: users.full_name,
      updated_at: progressByEnrollment.updated_at,
      progress: progressByEnrollment.progress,
    }
    const orderByColumn = orderByColumns[order] ?? progressByEnrollment.updated_at
    const primaryOrder = sql`${orderByColumn} ${sql.raw(descending ? 'desc' : 'asc')} nulls last`

    return await this.db
      .get()
      .select({
        user_id: users.id,
        full_name: users.full_name,
        activity_code: activityCodes.code,
        activity_code_id: activityCodes.id,
        activity_id: activities.id,
        progress: progressByEnrollment.progress,
        updated_at: progressByEnrollment.updated_at,
        created_at: progressByEnrollment.created_at,
        activity_name: activities.name,
        activity_url: activities.url,
        total: sql<number>`cast(count(*) over() as int)`,
      })
      .from(enrollment)
      .innerJoin(users, eq(enrollment.user_id, users.id))
      .leftJoin(
        progressByEnrollment,
        and(
          eq(enrollment.activity_id, progressByEnrollment.activity_id),
          eq(enrollment.user_id, progressByEnrollment.user_id)
        )
      )
      .innerJoin(activities, eq(enrollment.activity_id, activities.id))
      .innerJoin(activityCodes, eq(enrollment.activity_code_id, activityCodes.id))
      .where(eq(activityCodes.id, activity_code_id))
      .orderBy(primaryOrder, asc(activities.id), asc(users.id))
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
    data: Pick<ActivityCodeInsert, 'url_prefix' | 'description'>
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
  async addMember(activity_code_id: string, user_id: string): Promise<void> {
    await this.db
      .get()
      .insert(activityCodeMember)
      .values({ activity_code_id, user_id })
      .onConflictDoNothing()
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async removeMember(activity_code_id: string, user_id: string): Promise<void> {
    await this.db
      .get()
      .delete(activityCodeMember)
      .where(
        and(
          eq(activityCodeMember.activity_code_id, activity_code_id),
          eq(activityCodeMember.user_id, user_id)
        )
      )
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async deleteActivityCode(id: string): Promise<void> {
    await this.db
      .get()
      .delete(activityCodes)
      .where(eq(activityCodes.id, id))
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
