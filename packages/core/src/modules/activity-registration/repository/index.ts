import { and, asc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { activities, activityUrlAllowlistRules } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type ActivityRecord = typeof activities.$inferSelect

export type AllowlistRuleRecord = typeof activityUrlAllowlistRules.$inferSelect
export type AllowlistRuleInsert = typeof activityUrlAllowlistRules.$inferInsert

/** The fields an administrator may change on an existing rule. */
export type AllowlistRuleUpdate = Partial<
  Pick<AllowlistRuleRecord, 'description' | 'is_enabled' | 'updated_by'>
>

/**
 * Reads over the sitewide activity URL allowlist.
 *
 * This repository stores an already-normalized `(origin, path_prefix)` pair and
 * does not decide what normalized means — normalization and matching are the
 * pure matcher's job.
 */
export class ActivityUrlAllowlistQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'core', 'activity-registration')
    this.utils = deps.utils
    this.db = deps.db
  }

  /** Every rule, enabled or not, for the administrator's list. */
  @method
  async listRules(): Promise<AllowlistRuleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(activityUrlAllowlistRules)
      .orderBy(asc(activityUrlAllowlistRules.origin), asc(activityUrlAllowlistRules.path_prefix))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * The policy snapshot: only enabled rules admit anything, so an empty result
   * here denies every new registration.
   */
  @method
  async listEnabledRules(): Promise<AllowlistRuleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(activityUrlAllowlistRules)
      .where(eq(activityUrlAllowlistRules.is_enabled, true))
      .orderBy(asc(activityUrlAllowlistRules.origin), asc(activityUrlAllowlistRules.path_prefix))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findRuleById(id: string): Promise<AllowlistRuleRecord | undefined> {
    return await this.db
      .get()
      .query.activityUrlAllowlistRules.findFirst({
        where: eq(activityUrlAllowlistRules.id, id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * The normalizing-collision lookup: finds the rule a prospective base URL
   * would collide with, whether or not it is currently enabled.
   */
  @method
  async findRuleByBase(
    origin: string,
    path_prefix: string
  ): Promise<AllowlistRuleRecord | undefined> {
    return await this.db
      .get()
      .query.activityUrlAllowlistRules.findFirst({
        where: and(
          eq(activityUrlAllowlistRules.origin, origin),
          eq(activityUrlAllowlistRules.path_prefix, path_prefix)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Resolves an activity by its exact URL.
   *
   * This lives here, beside the rules, so the registration service can resolve
   * a URL without borrowing another module's repository — it is the only writer
   * of `activities`, so it owns the read that decides whether to write.
   */
  @method
  async findActivityByUrl(url: string): Promise<ActivityRecord | undefined> {
    return await this.db
      .get()
      .query.activities.findFirst({ where: eq(activities.url, url) })
      .catch(this.utils.wrapDbErrorNew())
  }
}

/** Writes over the sitewide activity URL allowlist, and the one `activities` insert. */
export class ActivityUrlAllowlistMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'core', 'activity-registration')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async createRule(data: AllowlistRuleInsert): Promise<AllowlistRuleRecord> {
    const [rule] = await this.db
      .get()
      .insert(activityUrlAllowlistRules)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(rule, { message: 'newly created allowlist rule is null' })

    return rule
  }

  /**
   * Changes the description, enabled state and provenance of a rule. `origin`
   * and `path_prefix` are not updatable: changing either would make the rule a
   * different rule, so the administrator deletes it and creates another.
   */
  @method
  async updateRule(
    id: string,
    data: AllowlistRuleUpdate
  ): Promise<AllowlistRuleRecord | undefined> {
    const [rule] = await this.db
      .get()
      .update(activityUrlAllowlistRules)
      .set({ ...data, updated_at: new Date() })
      .where(eq(activityUrlAllowlistRules.id, id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return rule
  }

  @method
  async deleteRule(id: string): Promise<void> {
    await this.db
      .get()
      .delete(activityUrlAllowlistRules)
      .where(eq(activityUrlAllowlistRules.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Inserts an activity, or does nothing if one already holds the URL.
   *
   * Returns the inserted row, or `undefined` when a concurrent insert won the
   * race — the caller then re-reads to find the winner.
   *
   * `onConflictDoNothing` is not optional here. Two instructors deep linking
   * the same new URL at the same moment is ordinary behaviour, not an
   * exception, and handling it in one place is the point of routing every
   * activity insert through this seam.
   */
  @method
  async insertActivity(url: string): Promise<ActivityRecord | undefined> {
    const [activity] = await this.db
      .get()
      .insert(activities)
      .values({ id: uuidv7(), url })
      .onConflictDoNothing({ target: activities.url })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return activity
  }
}
