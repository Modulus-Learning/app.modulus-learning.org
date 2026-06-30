import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
} from 'drizzle-orm'

import {
  lineitems,
  platformHealth,
  platformIncidents,
  platforms,
  progressEvents,
  submissionFailures,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type LineItemRecord = typeof lineitems.$inferSelect
export type LineItemInsert = typeof lineitems.$inferInsert
export type LineItemUpdate = Omit<Partial<LineItemRecord>, 'id'>

export type ClaimedLineItem = LineItemRecord & { submission_lease_token: string }

export type PlatformRecord = typeof platforms.$inferSelect
export type PlatformInsert = typeof platforms.$inferInsert
export type PlatformHealthRecord = typeof platformHealth.$inferSelect
export type PlatformHealthInsert = typeof platformHealth.$inferInsert
export type PlatformHealthUpdate = Omit<
  Partial<PlatformHealthRecord>,
  'platform_issuer' | 'created_at' | 'updated_at'
>
export type SubmissionFailureRecord = typeof submissionFailures.$inferSelect
export type SubmissionFailureInsert = typeof submissionFailures.$inferInsert
export type IncidentRecord = typeof platformIncidents.$inferSelect
export type IncidentInsert = typeof platformIncidents.$inferInsert
export type IncidentAggregateUpdate = {
  last_failure_at: Date
  failure_count: number
  distinct_affected_lineitems: number
  categories_seen: string[]
  severity: string
}

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

  @method
  async getPlatformHealth(issuer: string): Promise<PlatformHealthRecord | undefined> {
    return await this.db
      .get()
      .query.platformHealth.findFirst({ where: eq(platformHealth.platform_issuer, issuer) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getSubmissionFailuresForPlatformSince(
    issuer: string,
    timestamp: Date
  ): Promise<SubmissionFailureRecord[]> {
    return await this.db
      .get()
      .query.submissionFailures.findMany({
        where: and(
          eq(submissionFailures.platform_issuer, issuer),
          gt(submissionFailures.occurred_at, timestamp)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getOpenIncidentForPlatform(issuer: string): Promise<IncidentRecord | undefined> {
    return await this.db
      .get()
      .query.platformIncidents.findFirst({
        where: and(
          eq(platformIncidents.platform_issuer, issuer),
          isNull(platformIncidents.resolved_at)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getProgressAtCutoff(user_id: string, activity_id: string, cutoff: Date): Promise<number> {
    const [row] = await this.db
      .get()
      .select({
        progress: max(progressEvents.progress),
      })
      .from(progressEvents)
      .where(
        and(
          eq(progressEvents.user_id, user_id),
          eq(progressEvents.activity_id, activity_id),
          lte(progressEvents.submitted_at, cutoff)
        )
      )
      .catch(this.utils.wrapDbErrorNew())

    return row?.progress ?? 0
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
   * Finds and claims the submission lease of the next line item eligible for submission
   * for the given platform.
   *
   * A line item is eligible when:
   * - It has unsubmitted progress (i.e. `submittable_progress > submitted_progress`)
   * - It is not dead (i.e. `dead_at` is NULL)
   * - Its `submission_eligible_at` timestamp is in the past
   * - Its submission lease is not being held
   *
   * Among all such line items, the one whose `submission_eligible_at` date is oldest
   * will be selected.
   *
   * @param issuer - The unique `issuer` for the LTI platform
   * @param leaseTimeoutSeconds - The number of seconds until the claimed lease will expire
   *
   * @returns - The claimed lineitem (all fields), or undefined if none were found
   */
  @method
  async claimNextEligibleLineItem(
    issuer: string,
    leaseTimeoutSeconds: number
  ): Promise<ClaimedLineItem | undefined> {
    const db = this.db.get()

    // Subquery that selects the next eligible lineitem.
    const subquery = db.$with('next').as(
      db
        .select({ id: lineitems.id })
        .from(lineitems)
        .where(
          and(
            eq(lineitems.platform_issuer, issuer),
            isNull(lineitems.dead_at),
            gt(lineitems.submittable_progress, lineitems.submitted_progress),
            lte(lineitems.submission_eligible_at, sql`now()`),
            or(
              isNull(lineitems.submission_lease_expires_at),
              lt(lineitems.submission_lease_expires_at, sql`now()`)
            )
          )
        )
        .for('update', { skipLocked: true })
        .orderBy(asc(lineitems.submission_eligible_at))
        .limit(1)
    )

    // Find the next eligible lineitem according to the subquery,
    // claim its lease, and return the entire row.
    const [lineitem] = (await db
      .with(subquery)
      .update(lineitems)
      .set({
        submission_lease_expires_at: sql`now() + make_interval(secs => ${leaseTimeoutSeconds})`,
        submission_lease_token: sql`gen_random_uuid()`,
      })
      .from(subquery)
      .where(eq(lineitems.id, subquery.id))
      .returning(getTableColumns(lineitems))
      .catch(this.utils.wrapDbErrorNew())) as ClaimedLineItem[]

    return lineitem
  }

  @method
  async markSubmissionSuccess(
    lineitem: ClaimedLineItem,
    throttle_seconds: number
  ): Promise<boolean> {
    const result = await this.db
      .get()
      .update(lineitems)
      .set({
        submitted_progress: lineitem.submittable_progress,
        submitted_at: sql`now()`,
        submission_eligible_at: sql`now() + make_interval(secs => ${throttle_seconds})`,
        submission_lease_expires_at: null,
        submission_lease_token: null,
        submission_error_count: 0,
        submission_error_category: null,
        submission_error_message: null,
      })
      .where(
        and(
          eq(lineitems.id, lineitem.id),
          eq(lineitems.submission_lease_token, lineitem.submission_lease_token)
        )
      )
      .catch(this.utils.wrapDbErrorNew())

    return result.rowCount != null && result.rowCount > 0
  }

  @method
  async markSubmissionFailure(
    lineitem: ClaimedLineItem,
    error_category: string,
    error_message: string,
    backoff_ms: number
  ): Promise<boolean> {
    const result = await this.db
      .get()
      .update(lineitems)
      .set({
        submission_eligible_at: sql`now() + make_interval(secs => ${backoff_ms} / 1000.0)`,
        submission_lease_expires_at: null,
        submission_lease_token: null,
        submission_error_count: sql`${lineitems.submission_error_count} + 1`,
        submission_error_category: error_category,
        submission_error_message: error_message,
      })
      .where(
        and(
          eq(lineitems.id, lineitem.id),
          eq(lineitems.submission_lease_token, lineitem.submission_lease_token)
        )
      )
      .catch(this.utils.wrapDbErrorNew())

    return result.rowCount != null && result.rowCount > 0
  }

  @method
  async markSubmissionDead(
    lineitem: ClaimedLineItem,
    error_category: string,
    error_message: string
  ): Promise<boolean> {
    const result = await this.db
      .get()
      .update(lineitems)
      .set({
        dead_at: sql`now()`,
        submission_eligible_at: null,
        submission_lease_expires_at: null,
        submission_lease_token: null,
        submission_error_count: sql`${lineitems.submission_error_count} + 1`,
        submission_error_category: error_category,
        submission_error_message: error_message,
      })
      .where(
        and(
          eq(lineitems.id, lineitem.id),
          eq(lineitems.submission_lease_token, lineitem.submission_lease_token)
        )
      )
      .catch(this.utils.wrapDbErrorNew())

    return result.rowCount != null && result.rowCount > 0
  }

  @method
  async getPlatformHealthForUpdate(issuer: string): Promise<PlatformHealthRecord | undefined> {
    const rows = await this.db
      .get()
      .select()
      .from(platformHealth)
      .where(eq(platformHealth.platform_issuer, issuer))
      .for('update')
      .catch(this.utils.wrapDbErrorNew())

    return rows[0]
  }

  @method
  async setPlatformHealth(platform_issuer: string, timestamp: Date, data: PlatformHealthUpdate) {
    await this.db
      .get()
      .insert(platformHealth)
      .values({
        platform_issuer,
        created_at: timestamp,
        updated_at: timestamp,
        ...data,
      })
      .onConflictDoUpdate({
        target: [platformHealth.platform_issuer],
        set: {
          updated_at: timestamp,
          ...data,
        },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async recordSubmissionFailure(failure: SubmissionFailureInsert) {
    await this.db
      .get()
      .insert(submissionFailures)
      .values(failure)
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async openIncident(incident: IncidentInsert) {
    await this.db
      .get()
      .insert(platformIncidents)
      .values(incident)
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async updateIncidentAggregates(id: string, fields: IncidentAggregateUpdate) {
    await this.db
      .get()
      .update(platformIncidents)
      .set({ ...fields, updated_at: sql`now()` })
      .where(eq(platformIncidents.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Backfills the incident pointer onto the failure-log rows of an incident's
   * opening burst, so the log and the incident's counters agree.
   */
  @method
  async backfillFailureIncident(incident_id: string, failure_ids: string[]) {
    if (failure_ids.length === 0) {
      return
    }
    await this.db
      .get()
      .update(submissionFailures)
      .set({ incident_id })
      .where(inArray(submissionFailures.id, failure_ids))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async closeIncident(id: string, resolved_at: Date) {
    await this.db
      .get()
      .update(platformIncidents)
      .set({ resolved_at, updated_at: sql`now()` })
      .where(eq(platformIncidents.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  // @method
  // async incrementTransientPlatformErrors(platform_issuer: string) {
  //   await this.db
  //     .get()
  //     .insert(platformHealth)
  //     .values({
  //       platform_issuer,
  //       submission_queue_status: 'unhealthy',
  //       submission_transient_error_count: sql`${platformHealth.submission_transient_error_count} + 1`,
  //     })
  //     .onConflictDoUpdate({
  //       target: platformHealth.platform_issuer,
  //       set: {
  //         submission_queue_status: 'unhealthy',
  //         submission_transient_error_count: sql`${platformHealth.submission_transient_error_count} + 1`,
  //         updated_at: sql`NOW()`,
  //       },
  //     })
  //     .catch(this.utils.wrapDbErrorNew())
  // }

  // @method
  // async incrementPermanentPlatformErrors(platform_issuer: string) {
  //   await this.db
  //     .get()
  //     .insert(platformHealth)
  //     .values({
  //       platform_issuer,
  //       submission_queue_status: 'unhealthy',
  //       submission_permanent_error_count: sql`${platformHealth.submission_permanent_error_count} + 1`,
  //     })
  //     .onConflictDoUpdate({
  //       target: platformHealth.platform_issuer,
  //       set: {
  //         submission_queue_status: 'unhealthy',
  //         submission_permanent_error_count: sql`${platformHealth.submission_permanent_error_count} + 1`,
  //         updated_at: sql`NOW()`,
  //       },
  //     })
  //     .catch(this.utils.wrapDbErrorNew())
  // }

  // @method
  // async clearPlatformErrors(platform_issuer: string) {
  //   await this.db
  //     .get()
  //     .insert(platformHealth)
  //     .values({
  //       platform_issuer,
  //       submission_queue_status: 'healthy',
  //       submission_permanent_error_count: 0,
  //       submission_transient_error_count: 0,
  //     })
  //     .onConflictDoUpdate({
  //       target: platformHealth.platform_issuer,
  //       set: {
  //         submission_queue_status: 'healthy',
  //         submission_permanent_error_count: 0,
  //         submission_transient_error_count: 0,
  //         updated_at: sql`NOW()`,
  //       },
  //     })
  //     .catch(this.utils.wrapDbErrorNew())
  // }
}
