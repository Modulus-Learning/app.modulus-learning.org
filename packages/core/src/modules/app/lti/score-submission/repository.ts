import { and, eq, gt, isNull, lt, not, or, sql } from 'drizzle-orm'

import { lineitems, platformHealth, platforms, progress } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'
import type { PendingSubmission } from './types.js'

export type LineItemRecord = typeof lineitems.$inferSelect
export type LineItemInsert = typeof lineitems.$inferInsert
export type LineItemUpdate = Omit<Partial<LineItemRecord>, 'id'>
export type PlatformRecord = typeof platforms.$inferSelect
export type PlatformInsert = typeof platforms.$inferInsert
export type PlatformHealthRecord = typeof platformHealth.$inferSelect
export type PlatformHealthInsert = typeof platformHealth.$inferInsert

export class LtiScoreSubmissionQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAllPlatforms(): Promise<PlatformRecord[]> {
    return await this.db.get().query.platforms.findMany().catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getPlatformById(id: string): Promise<PlatformRecord | undefined> {
    return await this.db
      .get()
      .query.platforms.findFirst({ where: eq(platforms.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findPlatformByIssuer(issuer: string): Promise<PlatformRecord | undefined> {
    return await this.db
      .get()
      .query.platforms.findFirst({ where: eq(platforms.issuer, issuer) })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class LtiScoreSubmissionMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.utils = deps.utils
    this.db = deps.db
  }

  /**
   * Finds the next line item eligible for score submission for the given platform.
   *
   * A line item is eligible when:
   * - Its submitted_progress is less than the current progress
   * - It is not currently locked for submission (or the lock is stale)
   * - It is not in a backoff period after a failed attempt
   * - The progress was last updated more than `debounceSeconds` ago (debounce)
   *
   * Items that have never failed are prioritized over items in retry.
   * Among items of equal retry status, the oldest progress update is selected.
   *
   * @param debounceSeconds - Minimum seconds since last progress update (default 10)
   */
  @method
  async findNextPendingSubmission(
    issuer: string,
    { debounceSeconds }: { debounceSeconds: number }
  ): Promise<PendingSubmission | undefined> {
    const rows = await this.db
      .get()
      .select({
        lineitem_id: lineitems.id,
        lineitem_url: lineitems.lineitem_url,
        platform_issuer: lineitems.platform_issuer,
        deployment_id: lineitems.deployment_id,
        lti_user_id: lineitems.lti_user_id,
        submission_error_count: lineitems.submission_error_count,
        submission_error_category: lineitems.submission_error_category,
        current_progress: progress.progress,
      })
      .from(lineitems)
      .innerJoin(
        progress,
        and(
          eq(lineitems.user_id, progress.user_id),
          eq(lineitems.activity_id, progress.activity_id)
        )
      )
      .for('update', { of: lineitems, skipLocked: true })
      .where(
        and(
          // Only consider line items matching the given platform
          eq(lineitems.platform_issuer, issuer),

          // Only items where the current progress exceeds what was last submitted to the platform
          gt(progress.progress, lineitems.submitted_progress),

          // Not actively being updated (at least debounceSeconds have elapsed
          // since the last progress update was submitted to Modulus)
          lt(progress.updated_at, sql`NOW() - make_interval(secs => ${debounceSeconds})`),

          // Only items that are not dead (i.e. healthy or in cooldown)
          not(eq(lineitems.submission_status, 'dead')),

          // Not currently locked (or lock is stale)
          or(
            isNull(lineitems.submission_locked_until),
            lt(lineitems.submission_locked_until, sql`NOW()`)
          )
        )
      )
      .orderBy(
        // Prioritize items that became eligible for submission earliest.  Items become eligible
        // at the GREATEST of the following timestamps (ignoring nulls):
        // - 'debounceSeconds' after their most recent progress update
        // - their 'locked_until' time (if any)
        sql`GREATEST(${progress.updated_at} + make_interval(secs => ${debounceSeconds}), ${lineitems.submission_locked_until})`
      )
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())

    return rows[0]
  }

  /**
   * Attempts to claim a line item for score submission by setting
   * submission_locked_at. Returns true if the claim succeeded (i.e. the item
   * was not already locked by another worker).
   */
  @method
  async claimLineItemForSubmission(
    id: string,
    { lockTimeoutSeconds }: { lockTimeoutSeconds: number }
  ): Promise<boolean> {
    const rows = await this.db
      .get()
      .update(lineitems)
      .set({ submission_locked_until: sql`NOW() + make_interval(secs => ${lockTimeoutSeconds})` })
      .where(
        and(
          eq(lineitems.id, id),
          or(
            isNull(lineitems.submission_locked_until),
            lt(lineitems.submission_locked_until, sql`NOW()`)
          )
        )
      )
      .returning({ id: lineitems.id })
      .catch(this.utils.wrapDbErrorNew())

    return rows.length > 0
  }

  @method
  async updateLineItem(id: string, data: LineItemUpdate): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set(data)
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async updatePlatformHealth(
    platform_issuer: string,
    data: Omit<Partial<PlatformHealthRecord>, 'platform_issuer'>
  ) {
    await this.db
      .get()
      .update(platformHealth)
      .set(data)
      .where(eq(platformHealth.platform_issuer, platform_issuer))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async incrementTransientPlatformErrors(platform_issuer: string) {
    await this.db
      .get()
      .insert(platformHealth)
      .values({
        platform_issuer,
        submission_status: 'unhealthy',
        submission_transient_error_count: sql`${platformHealth.submission_transient_error_count} + 1`,
      })
      .onConflictDoUpdate({
        target: platformHealth.platform_issuer,
        set: {
          submission_status: 'unhealthy',
          submission_permanent_error_count: sql`${platformHealth.submission_transient_error_count} + 1`,
          updated_at: sql`NOW()`,
        },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async incrementPermanentPlatformErrors(platform_issuer: string) {
    await this.db
      .get()
      .insert(platformHealth)
      .values({
        platform_issuer,
        submission_status: 'unhealthy',
        submission_permanent_error_count: sql`${platformHealth.submission_permanent_error_count} + 1`,
      })
      .onConflictDoUpdate({
        target: platformHealth.platform_issuer,
        set: {
          submission_status: 'unhealthy',
          submission_permanent_error_count: sql`${platformHealth.submission_permanent_error_count} + 1`,
          updated_at: sql`NOW()`,
        },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async clearPlatformErrors(platform_issuer: string) {
    await this.db
      .get()
      .insert(platformHealth)
      .values({
        platform_issuer,
        submission_status: 'healthy',
        submission_permanent_error_count: 0,
        submission_transient_error_count: 0,
      })
      .onConflictDoUpdate({
        target: platformHealth.platform_issuer,
        set: {
          submission_status: 'healthy',
          submission_permanent_error_count: 0,
          submission_transient_error_count: 0,
          updated_at: sql`NOW()`,
        },
      })
      .catch(this.utils.wrapDbErrorNew())
  }
}
