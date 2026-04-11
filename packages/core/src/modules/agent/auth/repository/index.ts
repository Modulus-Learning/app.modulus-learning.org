import { eq } from 'drizzle-orm'

import { activities, agentAuthCodes, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type UserRecord = typeof users.$inferSelect
export type ActivityRecord = typeof activities.$inferSelect
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
  async createAuthCode(data: AuthCodeInsert): Promise<void> {
    await this.db.get().insert(agentAuthCodes).values(data).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async claimAuthCode(code: string): Promise<AuthCodeRecord | undefined> {
    const [authCode] = await this.db
      .get()
      .delete(agentAuthCodes)
      .where(eq(agentAuthCodes.code, code))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    return authCode
  }
}
