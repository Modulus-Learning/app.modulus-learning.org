import { and, eq, gt, lt } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { activities, agentAuthCodes, scopes, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type UserRecord = typeof users.$inferSelect
export type ActivityRecord = typeof activities.$inferSelect
export type ScopeRecord = typeof scopes.$inferSelect
export type AuthCodeRecord = typeof agentAuthCodes.$inferSelect
export type AuthCodeInsert = typeof agentAuthCodes.$inferInsert

export class AgentAuthQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'agent', 'auth')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getUser(id: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({ where: eq(users.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getActivity(id: string): Promise<ActivityRecord | undefined> {
    return await this.db
      .get()
      .query.activities.findFirst({ where: eq(activities.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findActivityByUrl(url: string): Promise<ActivityRecord | undefined> {
    return await this.db
      .get()
      .query.activities.findFirst({ where: eq(activities.url, url) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findScopeById(id: string): Promise<ScopeRecord | undefined> {
    return await this.db
      .get()
      .query.scopes.findFirst({ where: eq(scopes.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class AgentAuthMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'agent', 'auth')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async createActivity(url: string): Promise<ActivityRecord | undefined> {
    const [activity] = await this.db
      .get()
      .insert(activities)
      .values({ id: uuidv7(), url })
      .onConflictDoNothing({ target: activities.url })
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return activity
  }

  @method
  async createAuthCode(data: AuthCodeInsert): Promise<void> {
    await this.db.get().insert(agentAuthCodes).values(data).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async claimAuthCode(code: string): Promise<AuthCodeRecord | undefined> {
    // Single-use *and* time-bounded: the predicate excludes expired codes, so an
    // expired code is never claimed (and is left in place for the housekeeping
    // worker to prune).
    const [authCode] = await this.db
      .get()
      .delete(agentAuthCodes)
      .where(and(eq(agentAuthCodes.code, code), gt(agentAuthCodes.expires_at, new Date())))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return authCode
  }

  @method
  async pruneExpiredAuthCodes(): Promise<number> {
    const deleted = await this.db
      .get()
      .delete(agentAuthCodes)
      .where(lt(agentAuthCodes.expires_at, new Date()))
      .returning({ code: agentAuthCodes.code })
      .catch(this.utils.wrapDbErrorNew())

    return deleted.length
  }
}
