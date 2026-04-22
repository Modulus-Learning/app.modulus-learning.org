import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

import { launches, lineitems, nonces, platforms, progress } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type LineItemRecord = typeof lineitems.$inferSelect
export type LineItemInsert = typeof lineitems.$inferInsert
export type NonceRecord = typeof nonces.$inferSelect
export type NonceInsert = typeof nonces.$inferInsert
export type PlatformRecord = typeof platforms.$inferSelect
export type PlatformInsert = typeof platforms.$inferInsert
export type LaunchRecord = typeof launches.$inferSelect
export type LaunchInsert = typeof launches.$inferInsert

export type LineItemQueryOptions = {
  user_id: string
  activity_id: string
  lineitem_url: string
}

/**
 * A line item that is eligible for score submission, joined with the
 * current progress value from the progress table.
 */
export type PendingSubmission = {
  lineitem_id: string
  lineitem_url: string
  platform_issuer: string
  lti_user_id: string
  current_progress: number
}

export class LtiQueries extends BaseService {
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
  async findLaunch(launchId: string): Promise<LaunchRecord | undefined> {
    return await this.db
      .get()
      .query.launches.findFirst({ where: eq(launches.id, launchId) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findNonce(nonce: string): Promise<NonceRecord | undefined> {
    return await this.db
      .get()
      .query.nonces.findFirst({ where: eq(nonces.nonce, nonce) })
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
  async findLineItem({
    user_id,
    activity_id,
    lineitem_url,
  }: LineItemQueryOptions): Promise<LineItemRecord | undefined> {
    return await this.db
      .get()
      .query.lineitems.findFirst({
        where: and(
          eq(lineitems.user_id, user_id),
          eq(lineitems.activity_id, activity_id),
          eq(lineitems.lineitem_url, lineitem_url)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getLineItems(user_id: string, activity_id: string): Promise<LineItemRecord[]> {
    return await this.db
      .get()
      .query.lineitems.findMany({
        where: and(eq(lineitems.user_id, user_id), eq(lineitems.activity_id, activity_id)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Finds the next line item eligible for score submission.
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
   * @param lockTimeoutSeconds - How long before a lock is considered stale (default 60)
   * @param debounceSeconds - Minimum seconds since last progress update (default 10)
   */
  @method
  async findNextPendingSubmission({
    lockTimeoutSeconds = 60,
    debounceSeconds = 10,
  }: {
    lockTimeoutSeconds?: number
    debounceSeconds?: number
  } = {}): Promise<PendingSubmission | undefined> {
    const rows = await this.db
      .get()
      .select({
        lineitem_id: lineitems.id,
        lineitem_url: lineitems.lineitem_url,
        platform_issuer: lineitems.platform_issuer,
        lti_user_id: lineitems.lti_user_id,
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
      .where(
        and(
          // Only items where the current progress exceeds what was last submitted
          gt(progress.progress, lineitems.submitted_progress),

          // Not currently locked (or lock is stale)
          or(
            isNull(lineitems.submission_locked_at),
            lt(lineitems.submission_locked_at, sql`NOW() - make_interval(secs => ${lockTimeoutSeconds})`)
          ),

          // Not in a backoff period
          or(
            isNull(lineitems.submission_next_retry_at),
            lt(lineitems.submission_next_retry_at, sql`NOW()`)
          ),

          // Debounce: don't submit until the student has stopped updating for
          // at least debounceSeconds
          lt(progress.updated_at, sql`NOW() - make_interval(secs => ${debounceSeconds})`)
        )
      )
      .orderBy(
        sql`${lineitems.submission_next_retry_at} NULLS FIRST`,
        progress.updated_at
      )
      .limit(1)
      .catch(this.utils.wrapDbErrorNew())

    return rows[0]
  }
}

export class LtiMutations extends BaseService {
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
  async insertLaunch(launch: LaunchInsert): Promise<void> {
    await this.db.get().insert(launches).values(launch).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async insertNonce(nonce: string): Promise<void> {
    await this.db.get().insert(nonces).values({ nonce }).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async markNonceUsed(nonce: string): Promise<void> {
    await this.db
      .get()
      .update(nonces)
      .set({ used: true })
      .where(eq(nonces.nonce, nonce))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async insertLineItem(lineItem: LineItemInsert): Promise<LineItemRecord> {
    const [result] = await this.db
      .get()
      .insert(lineitems)
      .values(lineItem)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'newly created line item is null' })

    return result
  }

  @method
  async updateLineItem(id: string, data: Omit<Partial<LineItemRecord>, 'id'>): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set(data)
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Attempts to claim a line item for score submission by setting
   * submission_locked_at. Returns true if the claim succeeded (i.e. the item
   * was not already locked by another worker).
   */
  @method
  async claimLineItemForSubmission(id: string): Promise<boolean> {
    const rows = await this.db
      .get()
      .update(lineitems)
      .set({ submission_locked_at: sql`NOW()` })
      .where(and(eq(lineitems.id, id), isNull(lineitems.submission_locked_at)))
      .returning({ id: lineitems.id })
      .catch(this.utils.wrapDbErrorNew())

    return rows.length > 0
  }

  /**
   * Marks a line item's score submission as successful. Clears all submission
   * tracking state and updates submitted_progress to the score that was sent.
   */
  @method
  async markSubmissionSuccess(id: string, submittedProgress: number): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set({
        submitted_progress: submittedProgress,
        submission_locked_at: null,
        submission_attempts: 0,
        submission_next_retry_at: null,
        submission_last_error: null,
      })
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Marks a line item's score submission as failed. Releases the lock,
   * increments the attempt counter, and sets the next retry time using
   * exponential backoff.
   *
   * @param backoffBaseSeconds - Base delay for exponential backoff (default 5)
   * @param maxBackoffSeconds - Maximum backoff delay cap (default 300 = 5 minutes)
   */
  @method
  async markSubmissionFailure(
    id: string,
    error: string,
    { backoffBaseSeconds = 5, maxBackoffSeconds = 300 }: {
      backoffBaseSeconds?: number
      maxBackoffSeconds?: number
    } = {}
  ): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set({
        submission_locked_at: null,
        submission_attempts: sql`${lineitems.submission_attempts} + 1`,
        submission_next_retry_at: sql`NOW() + make_interval(secs => LEAST(${maxBackoffSeconds}, ${backoffBaseSeconds} * power(2, ${lineitems.submission_attempts})))`,
        submission_last_error: error,
      })
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }
}
