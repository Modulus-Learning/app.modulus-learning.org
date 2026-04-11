import { and, eq, lt, ne, sql } from 'drizzle-orm'

import { emailChangeRequests, roles, roleUser, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type RoleRecord = typeof roles.$inferSelect
export type EmailChangeRequestRecord = typeof emailChangeRequests.$inferSelect
export type EmailChangeRequestInsert = typeof emailChangeRequests.$inferInsert

export type AccountRecord = {
  id: string
  vid: number
  full_name: string | null
  username: string | null
  email: string | null
  has_password: boolean
  // has_github: boolean
  // has_google: boolean
  // has_lti: boolean
  github_id: number | null
  google_id: string | null
  lti_iss: string | null
  lti_sub: string | null
  last_provider: string | null
  last_login: Date | null
  is_enabled: boolean
  created_at: Date
  updated_at: Date
  roles: string[]
}

export type AccountForUpdate = {
  vid: number
}

export type AccountForPasswordUpdate = {
  vid: number
  password: string | null
}

export type AccountUpdate = {
  vid: number
  updated_at: Date
  full_name?: string
  password?: string
  email?: string
}

export class AccountQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'app', 'account')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAccount(user_id: string): Promise<AccountRecord | undefined> {
    const [account] = await this.db
      .get()
      .select({
        id: users.id,
        vid: users.vid,
        full_name: users.full_name,
        username: users.username,
        email: users.email,
        github_id: users.github_id,
        google_id: users.google_id,
        lti_iss: users.lti_iss,
        lti_sub: users.lti_sub,
        has_password: sql<boolean>`coalesce(users.password LIKE '$argon%', false)`,
        last_provider: users.last_provider,
        last_login: users.last_login,
        is_enabled: users.is_enabled,
        created_at: users.created_at,
        updated_at: users.updated_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
        coalesce(
          array_agg(roles.id ORDER BY roles.order) FILTER (
            WHERE roles.id IS NOT NULL 
            AND roles.machine_name != 'everyone'
          ),
          '{}'
        )`,
      })
      .from(users)
      .leftJoin(roleUser, eq(roleUser.user_id, users.id))
      .leftJoin(roles, eq(roles.id, roleUser.role_id))
      .where(eq(users.id, user_id))
      .groupBy(users.id)
      .catch(this.utils.wrapDbErrorNew())

    return account
  }

  @method
  async getRoles(): Promise<RoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(roles)
      .where(ne(roles.machine_name, 'everyone'))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findUserIdByEmail(email: string): Promise<string | undefined> {
    const result = await this.db
      .get()
      .query.users.findFirst({
        columns: { id: true },
        where: eq(users.email, email),
      })
      .catch(this.utils.wrapDbErrorNew())

    return result?.id
  }

  @method
  async findEmailChangeRequest(
    user_id: string,
    verification_code: string
  ): Promise<EmailChangeRequestRecord | undefined> {
    return await this.db
      .get()
      .query.emailChangeRequests.findFirst({
        where: and(
          eq(emailChangeRequests.verification_code, verification_code),
          eq(emailChangeRequests.user_id, user_id)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class AccountMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'account')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAccountVersionForUpdate(user_id: string): Promise<AccountForUpdate | undefined> {
    const [account] = await this.db
      .get()
      .select({ vid: users.vid })
      .from(users)
      .for('update')
      .where(eq(users.id, user_id))
      .catch(this.utils.wrapDbErrorNew())

    return account
  }

  @method
  async getAccountPasswordForUpdate(
    user_id: string
  ): Promise<AccountForPasswordUpdate | undefined> {
    const [account] = await this.db
      .get()
      .select({ vid: users.vid, password: users.password })
      .from(users)
      .for('update')
      .where(eq(users.id, user_id))
      .catch(this.utils.wrapDbErrorNew())

    return account
  }

  @method
  async updateAccount(user_id: string, data: AccountUpdate) {
    await this.db
      .get()
      .update(users)
      .set(data)
      .where(eq(users.id, user_id))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async createEmailChangeRequest(data: EmailChangeRequestInsert) {
    await this.db.get().insert(emailChangeRequests).values(data).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async pruneEmailChangeRequests(cutoff: Date) {
    await this.db
      .get()
      .delete(emailChangeRequests)
      .where(lt(emailChangeRequests.created_at, cutoff))
      .execute()
      .catch(this.utils.wrapDbErrorNew())
  }
}
