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
   * The policy snapshot: disabled rules are ignored. An empty result means
   * every syntactically admissible URL is allowed.
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
   * Every activity URL, for the administrator's grandfathering preview.
   *
   * The preview matches these against a prospective rule set in the service,
   * using the same pure matcher every admission uses. Doing it in SQL instead
   * would be a second implementation of the matching contract, free to drift
   * from the first.
   */
  @method
  async listActivities(): Promise<Pick<ActivityRecord, 'id' | 'url'>[]> {
    return await this.db
      .get()
      .select({ id: activities.id, url: activities.url })
      .from(activities)
      .orderBy(asc(activities.url))
      .catch(this.utils.wrapDbErrorNew())
  }

  /**
   * Resolves an activity by its exact URL.
   *
   * `url` is a canonical activity URL key, already produced by the calling
   * service with `normalizeActivityUrl()`. This is SQL equality over the
   * stored canonical form and deliberately knows nothing about URL spelling;
   * passing a raw submitted URL would miss equivalent spellings.
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

  /**
   * Inserts a rule, or does nothing if one already holds the same normalized
   * base.
   *
   * Returns the inserted row, or `undefined` when a concurrent create won the
   * race -- the caller then re-reads to find the winner and reports it. Two
   * administrators submitting the same base URL at the same moment must not
   * turn one of their requests into a unique-violation error: they asked for a
   * state, and the create outcome exists to answer them in those terms.
   */
  @method
  async createRule(data: AllowlistRuleInsert): Promise<AllowlistRuleRecord | undefined> {
    const [rule] = await this.db
      .get()
      .insert(activityUrlAllowlistRules)
      .values(data)
      .onConflictDoNothing({
        target: [activityUrlAllowlistRules.origin, activityUrlAllowlistRules.path_prefix],
      })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

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
   * `url` is the canonical activity URL key the registration service derived
   * and admitted; it is stored as given. Because equivalent spellings share
   * that key, the unique constraint on `activities.url` also resolves races
   * between different spellings of one page.
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
