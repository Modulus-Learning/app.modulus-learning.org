import { and, asc, eq, lt, ne, sql } from 'drizzle-orm'

import {
  adminRoleAdminUser,
  adminRoles,
  adminUsers,
  emailChangeRequests,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type RoleRecord = typeof adminRoles.$inferSelect

export type EmailChangeRequestRecord = typeof emailChangeRequests.$inferSelect
export type EmailChangeRequestInsert = typeof emailChangeRequests.$inferInsert

export type AccountRecord = {
  id: string
  vid: number
  given_name: string | null
  family_name: string | null
  has_password: boolean
  email: string | null
  last_login: Date | null
  is_enabled: boolean
  created_at: Date
  updated_at: Date
  roles: string[]
}

export type AccountVersionForUpdate = {
  vid: number
  password: string | null
}

export type AccountUpdate = {
  vid: number
  updated_at: Date
  given_name?: string
  family_name?: string
  password?: string
  email?: string
}

export class AdminAccountQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'account')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAccount(admin_user_id: string): Promise<AccountRecord | undefined> {
    const [account] = await this.db
      .get()
      .select({
        id: adminUsers.id,
        vid: adminUsers.vid,
        given_name: adminUsers.given_name,
        family_name: adminUsers.family_name,
        has_password: sql<boolean>`coalesce(admin_users.password LIKE '$argon%', false)`,
        email: adminUsers.email,
        last_login: adminUsers.last_login,
        is_enabled: adminUsers.is_enabled,
        created_at: adminUsers.created_at,
        updated_at: adminUsers.updated_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
        coalesce(
          array_agg(admin_roles.id ORDER BY admin_roles.order) FILTER (
            WHERE admin_roles.id IS NOT NULL 
            AND admin_roles.machine_name != 'everyone'
          ),
          '{}'
        )`,
      })
      .from(adminUsers)
      .leftJoin(adminRoleAdminUser, eq(adminRoleAdminUser.admin_user_id, adminUsers.id))
      .leftJoin(adminRoles, and(eq(adminRoles.id, adminRoleAdminUser.admin_role_id)))
      .where(eq(adminUsers.id, admin_user_id))
      .groupBy(adminUsers.id)
      .catch(this.utils.wrapDbError('AdminAccountQueries.getAccount'))

    return account
  }

  @method
  async getRoles(): Promise<RoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(adminRoles)
      .where(ne(adminRoles.machine_name, 'everyone'))
      .orderBy(asc(adminRoles.order))
      .catch(this.utils.wrapDbError('AdminAccountQueries.getRoles'))
  }

  @method
  async findAdminUserIdByEmail(email: string): Promise<string | undefined> {
    const result = await this.db
      .get()
      .query.adminUsers.findFirst({ columns: { id: true }, where: eq(adminUsers.email, email) })
      .catch(this.utils.wrapDbError('AdminAccountQueries.findAdminUserIdByEmail'))

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
      .catch(this.utils.wrapDbError('AccountQueries.findEmailChangeRequest'))
  }
}

export class AdminAccountMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'account')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAccountVersionForUpdate(
    admin_user_id: string
  ): Promise<AccountVersionForUpdate | undefined> {
    const [account] = await this.db
      .get()
      .select({
        vid: adminUsers.vid,
        password: adminUsers.password,
      })
      .from(adminUsers)
      .for('update')
      .where(eq(adminUsers.id, admin_user_id))
      .catch(this.utils.wrapDbError('AdminAccountMutations.getAccountVersionForUpdate'))

    return account
  }

  @method
  async updateAccount(admin_user_id: string, data: AccountUpdate) {
    await this.db
      .get()
      .update(adminUsers)
      .set(data)
      .where(eq(adminUsers.id, admin_user_id))
      .catch(this.utils.wrapDbError('AdminAccountMutations.updateAccount'))
  }

  @method
  async createEmailChangeRequest(data: EmailChangeRequestInsert) {
    await this.db
      .get()
      .insert(emailChangeRequests)
      .values(data)
      .catch(this.utils.wrapDbError('AdminAccountMutations.createEmailChangeRequest'))
  }

  @method
  async pruneEmailChangeRequests(cutoff: Date) {
    await this.db
      .get()
      .delete(emailChangeRequests)
      .where(lt(emailChangeRequests.created_at, cutoff))
      .execute()
      .catch(this.utils.wrapDbError('AccountMutations.pruneEmailChangeRequests'))
  }
}
