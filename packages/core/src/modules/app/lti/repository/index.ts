import { and, eq, lt, lte, max, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  lineitems,
  nonces,
  pendingDeepLinks,
  platformDeployments,
  type platformHealth,
  platforms,
  progress,
  progressEvents,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type NonceRecord = typeof nonces.$inferSelect
export type NonceInsert = typeof nonces.$inferInsert
export type PendingDeepLinkRecord = typeof pendingDeepLinks.$inferSelect
export type PendingDeepLinkInsert = typeof pendingDeepLinks.$inferInsert
export type LineItemRecord = typeof lineitems.$inferSelect
export type LineItemInsert = typeof lineitems.$inferInsert
export type PlatformRecord = typeof platforms.$inferSelect
export type PlatformInsert = typeof platforms.$inferInsert
export type PlatformHealthRecord = typeof platformHealth.$inferSelect
export type PlatformHealthInsert = typeof platformHealth.$inferInsert

export type LineItemUpsert = Pick<
  LineItemInsert,
  | 'user_id'
  | 'activity_id'
  | 'platform_issuer'
  | 'deployment_id'
  | 'lineitem_url'
  | 'lti_user_id'
  | 'cutoff_at'
  | 'submittable_progress'
>

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
  deployment_id: string
  lti_user_id: string
  submission_failure_count: number
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
  async findPendingDeepLink(id: string): Promise<PendingDeepLinkRecord | undefined> {
    return await this.db
      .get()
      .query.pendingDeepLinks.findFirst({ where: eq(pendingDeepLinks.id, id) })
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
  async getProgressWithCutoff(
    user_id: string,
    activity_id: string,
    cutoff: Date | undefined
  ): Promise<number> {
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
          cutoff == null ? undefined : lte(progressEvents.submitted_at, cutoff)
        )
      )
      .catch(this.utils.wrapDbErrorNew())

    return row?.progress ?? 0
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
  async insertPendingDeepLink(record: PendingDeepLinkInsert): Promise<void> {
    await this.db.get().insert(pendingDeepLinks).values(record).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async pruneExpiredNonces(olderThan: Date): Promise<number> {
    const deleted = await this.db
      .get()
      .delete(nonces)
      .where(lt(nonces.created_at, olderThan))
      .returning({ nonce: nonces.nonce })
      .catch(this.utils.wrapDbErrorNew())

    return deleted.length
  }

  @method
  async pruneExpiredDeepLinks(): Promise<number> {
    const deleted = await this.db
      .get()
      .delete(pendingDeepLinks)
      .where(lt(pendingDeepLinks.expires_at, new Date()))
      .returning({ id: pendingDeepLinks.id })
      .catch(this.utils.wrapDbErrorNew())

    return deleted.length
  }

  @method
  async insertNonce(nonce: string): Promise<void> {
    await this.db.get().insert(nonces).values({ nonce }).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async claimNonce(nonce: string): Promise<boolean> {
    // Atomically consume the nonce: mark it used only if it currently exists
    // and is still unused, returning whether the claim succeeded.  Zero rows
    // means the nonce is unknown or already consumed -- both are an
    // invalid/replayed launch.
    const claimed = await this.db
      .get()
      .update(nonces)
      .set({ used: true })
      .where(and(eq(nonces.nonce, nonce), eq(nonces.used, false)))
      .returning({ nonce: nonces.nonce })
      .catch(this.utils.wrapDbErrorNew())

    return claimed.length > 0
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
  async upsertLineItem({
    user_id,
    activity_id,
    platform_issuer,
    deployment_id,
    lineitem_url,
    lti_user_id,
    cutoff_at,
    submittable_progress,
  }: LineItemUpsert): Promise<void> {
    await this.db
      .get()
      .insert(lineitems)
      .values({
        id: uuidv7(),
        user_id,
        activity_id,
        platform_issuer,
        deployment_id,
        lineitem_url,
        lti_user_id,
        cutoff_at,
        submittable_progress,
        submission_eligible_at: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [lineitems.user_id, lineitems.activity_id, lineitems.lineitem_url],
        set: {
          cutoff_at,
          submittable_progress: sql`GREATEST(${lineitems.submittable_progress}, ${submittable_progress})`,
          dead_at: null,
          submission_eligible_at: sql`
            CASE WHEN ${lineitems.submittable_progress} > ${lineitems.submitted_progress}
            THEN COALESCE(${lineitems.submission_eligible_at}, now())
            ELSE GREATEST(${lineitems.submission_eligible_at}, now()) END`,
          updated_at: sql`now()`,
        },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async upsertPlatformDeployment(platform_issuer: string, deployment_id: string): Promise<void> {
    await this.db
      .get()
      .insert(platformDeployments)
      .values({
        platform_issuer,
        deployment_id,
      })
      .onConflictDoUpdate({
        target: [platformDeployments.platform_issuer, platformDeployments.deployment_id],
        set: { updated_at: sql`NOW()` },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async upsertProgress(activity_id: string, user_id: string): Promise<void> {
    await this.db
      .get()
      .insert(progress)
      .values({
        activity_id,
        user_id,
        progress: 0,
        created_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [progress.activity_id, progress.user_id],
        set: { progress: progress.progress },
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async updateLineItem(
    id: string,
    data: Omit<Partial<LineItemRecord>, 'id' | 'updated_at' | 'created_at'>
  ): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set({ ...data, updated_at: sql`NOW()` })
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }
}
