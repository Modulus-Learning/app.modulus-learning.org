import { eq, inArray } from 'drizzle-orm'

import {
  adminPermissions,
  adminRoleAdminUser,
  adminRoles,
  adminUsers,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type AdminUserRecord = typeof adminUsers.$inferSelect
export type AdminUserInsert = typeof adminUsers.$inferInsert
export type AdminRoleRecord = typeof adminRoles.$inferSelect
export type AdminRoleInsert = typeof adminRoles.$inferInsert

export class AdminSessionQueries extends BaseService {
  private db: DBManager
  private utils: CoreUtils

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'session')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAdminUser(id: string): Promise<AdminUserRecord | undefined> {
    return await this.db
      .get()
      .query.adminUsers.findFirst({ where: eq(adminUsers.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findAdminUserByEmail(email: string): Promise<AdminUserRecord | undefined> {
    return await this.db
      .get()
      .query.adminUsers.findFirst({ where: eq(adminUsers.email, email) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findAdminRoleIdsByMachineName(names: string[]): Promise<string[]> {
    const roleArray = await this.db
      .get()
      .query.adminRoles.findMany({
        where: inArray(adminRoles.machine_name, names),
      })
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assert(roleArray.length === names.length, {
      message: 'expected roles are missing',
    })

    return roleArray.map((role) => role.id)
  }

  @method
  async getAdminUserAbilities(admin_user_id: string): Promise<string[]> {
    const result = await this.db
      .get()
      .select({ ability: adminPermissions.ability })
      .from(adminPermissions)
      .innerJoin(
        adminRoleAdminUser,
        eq(adminPermissions.admin_role_id, adminRoleAdminUser.admin_role_id)
      )
      .where(eq(adminRoleAdminUser.admin_user_id, admin_user_id))
      .catch(this.utils.wrapDbErrorNew())

    return result.map((row) => row.ability)
  }
}

export class AdminSessionMutations extends BaseService {
  private db: DBManager
  private utils: CoreUtils

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'session')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async updateAdminUser(
    admin_user_id: string,
    data: Partial<AdminUserInsert>
  ): Promise<AdminUserRecord> {
    const [updatedUser] = await this.db
      .get()
      .update(adminUsers)
      .set(data)
      .where(eq(adminUsers.id, admin_user_id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(updatedUser, { message: 'updated admin user is null' })

    return updatedUser
  }
}
