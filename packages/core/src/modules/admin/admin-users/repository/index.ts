import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'

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
export type AdminUserForUpdate = Pick<AdminUserRecord, 'id' | 'vid' | 'email'>

export type AdminUserRecordWithRoles = Pick<
  AdminUserRecord,
  | 'id'
  | 'vid'
  | 'given_name'
  | 'family_name'
  | 'username'
  | 'email'
  | 'is_enabled'
  | 'created_at'
  | 'updated_at'
> & {
  roles: string[]
}

export type AdminRoleRecord = typeof adminRoles.$inferSelect

export type AdminUserListOptions = {
  page: number
  page_size: number
  order: 'created_at' | 'id' | 'given_name' | 'family_name' | 'username' | 'email'
  role: string
  query?: string | undefined
  desc: boolean
}

export class AdminUserQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'admin-users')
    this.utils = deps.utils
    this.db = deps.db
  }

  // This method returns role names in the 'roles' field of
  // AdminUserRecordWithRoles, while getAdminUserWithRoles below returns role
  // ids in that field.  TODO: Refactor so these return the same value (whether
  // its a name or an id), or use a different type name.
  @method
  async getAdminUserList(
    options: AdminUserListOptions
  ): Promise<{ results: AdminUserRecordWithRoles[]; total: number }> {
    const { page, page_size, order, role, query, desc: descending } = options
    const limit = page_size
    const offset = (page - 1) * page_size
    const orderByColumn = adminUsers[order]

    const filters: (SQL | undefined)[] = []
    if (role !== 'all') {
      filters.push(eq(adminRoles.machine_name, role))
    }

    if (query != null && query.length > 0) {
      // TODO: query should be escaped / sanitized here (e.g., any % characters
      // it contains should be escaped)
      const searchTerm = `%${query}%`
      filters.push(
        or(
          ilike(adminUsers.given_name, searchTerm),
          ilike(adminUsers.family_name, searchTerm),
          ilike(adminUsers.username, searchTerm),
          ilike(adminUsers.email, searchTerm)
        )
      )
    }

    const results = await this.db
      .get()
      .select({
        id: adminUsers.id,
        vid: adminUsers.vid,
        given_name: adminUsers.given_name,
        family_name: adminUsers.family_name,
        username: adminUsers.username,
        is_enabled: adminUsers.is_enabled,
        email: adminUsers.email,
        created_at: adminUsers.created_at,
        updated_at: adminUsers.updated_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
        coalesce(
          array_agg(admin_roles.name ORDER BY admin_roles.order) FILTER (
            WHERE admin_roles.name IS NOT NULL),
          '{}'
        )`,
        // Total still works, despite the leftJoin below because we call
        // .groupBy(adminUsers.id) further down.
        total: sql<number>`cast(count(*) over() as int)`,
      })
      .from(adminUsers)
      .leftJoin(adminRoleAdminUser, eq(adminRoleAdminUser.admin_user_id, adminUsers.id))
      .leftJoin(adminRoles, and(eq(adminRoles.id, adminRoleAdminUser.admin_role_id)))
      .where(and(...filters))
      .groupBy(adminUsers.id)
      .orderBy(
        descending ? desc(orderByColumn) : asc(orderByColumn),
        descending ? desc(adminUsers.id) : asc(adminUsers.id)
      )
      .limit(limit)
      .offset(offset)
      .catch(this.utils.wrapDbError('AdminUserQueries.getAdminUserList'))

    return {
      results: results.map(({ total, ...rest }) => ({ ...rest })),
      total: results?.[0]?.total ?? 0,
    }
  }

  @method
  async getAdminUser(id: string): Promise<AdminUserRecord | undefined> {
    return await this.db
      .get()
      .query.adminUsers.findFirst({ where: eq(adminUsers.id, id) })
      .catch(this.utils.wrapDbError('AdminUserQueries.getAdminUser'))
  }

  @method
  async findAdminUserByEmail(email: string): Promise<AdminUserRecord | undefined> {
    return await this.db
      .get()
      .query.adminUsers.findFirst({
        where: eq(adminUsers.email, email),
      })
      .catch(this.utils.wrapDbError('AdminUserQueries.findAdminUserByEmail'))
  }

  @method
  async getAdminUserWithRoles(id: string): Promise<AdminUserRecordWithRoles | undefined> {
    const [adminUser] = await this.db
      .get()
      .select({
        id: adminUsers.id,
        vid: adminUsers.vid,
        given_name: adminUsers.given_name,
        family_name: adminUsers.family_name,
        username: adminUsers.username,
        email: adminUsers.email,
        is_enabled: adminUsers.is_enabled,
        created_at: adminUsers.created_at,
        updated_at: adminUsers.created_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
        coalesce(
          array_agg(admin_roles.id ORDER BY admin_roles.order) FILTER (
            WHERE admin_roles.id IS NOT NULL 
          ),
          '{}'
        )`,
      })
      .from(adminUsers)
      .leftJoin(adminRoleAdminUser, eq(adminRoleAdminUser.admin_user_id, adminUsers.id))
      .leftJoin(adminRoles, and(eq(adminRoles.id, adminRoleAdminUser.admin_role_id)))
      .where(eq(adminUsers.id, id))
      .groupBy(adminUsers.id)
      .catch(this.utils.wrapDbError('AdminUserQueries.getAdminUserWithRoles'))

    return adminUser
  }

  @method
  async getAllAdminRoles(): Promise<AdminRoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(adminRoles)
      .catch(this.utils.wrapDbError('AdminUserQueries.getAllAdminRoles'))
  }

  @method
  async findAdminRoleIdsByMachineName(names: string[]): Promise<string[]> {
    const roleArray = await this.db
      .get()
      .query.adminRoles.findMany({
        where: inArray(adminRoles.machine_name, names),
      })
      .catch(this.utils.wrapDbError('AdminUserQueries.findAdminRoleIdsByMachineName'))

    this.utils.assert(roleArray.length === names.length, {
      message: 'expected admin roles are missing',
    })

    return roleArray.map((role) => role.id)
  }

  async getAdminUserAbilities(id: string): Promise<string[]> {
    const result = await this.db
      .get()
      .select({ ability: adminPermissions.ability })
      .from(adminPermissions)
      .innerJoin(
        adminRoleAdminUser,
        eq(adminPermissions.admin_role_id, adminRoleAdminUser.admin_role_id)
      )
      .where(eq(adminRoleAdminUser.admin_user_id, id))
      .catch(this.utils.wrapDbError('AdminUserQueries.getAdminUserAbilities'))

    // TODO: Why is ability nullable?
    return result.map((row) => row.ability).filter((ability) => ability != null)
  }
}

export class AdminUserMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'admin-users')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAdminUserForUpdate(id: string): Promise<AdminUserForUpdate | undefined> {
    const [adminUser] = await this.db
      .get()
      .select({ id: adminUsers.id, vid: adminUsers.vid, email: adminUsers.email })
      .from(adminUsers)
      .for('update')
      .where(eq(adminUsers.id, id))
      .catch(this.utils.wrapDbError('AdminUserQueries.getAdminUser'))

    return adminUser
  }

  @method
  async createAdminUser(data: AdminUserInsert): Promise<AdminUserRecord> {
    const [adminUser] = await this.db
      .get()
      .insert(adminUsers)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbError('AdminUserMutations.createAdminUser'))

    this.utils.assertExists(adminUser, { message: 'newly created admin user is null' })

    return adminUser
  }

  @method
  async updateAdminUser(
    id: string,
    data: Partial<AdminUserInsert>
  ): Promise<AdminUserRecord | undefined> {
    const [updatedAdminUser] = await this.db
      .get()
      .update(adminUsers)
      .set(data)
      .where(eq(adminUsers.id, id))
      .returning()
      .catch(this.utils.wrapDbError('AdminUserMutations.updateAdminUser'))

    return updatedAdminUser
  }

  @method
  async deleteAdminUser(id: string): Promise<void> {
    await this.db
      .get()
      .delete(adminUsers)
      .where(eq(adminUsers.id, id))
      .catch(this.utils.wrapDbError('AdminUserMutations.deleteAdminUserRoles'))
  }

  @method
  async addAdminUserToRoles(admin_user_id: string, admin_role_ids: string[]): Promise<void> {
    if (admin_role_ids.length > 0) {
      await this.db
        .get()
        .insert(adminRoleAdminUser)
        .values(admin_role_ids.map((admin_role_id) => ({ admin_user_id, admin_role_id })))
        .execute()
        .catch(this.utils.wrapDbError('AdminUserMutations.addAdminUserToRoles'))
    }
  }

  @method
  async deleteAdminUserRoles(admin_user_id: string): Promise<void> {
    await this.db
      .get()
      .delete(adminRoleAdminUser)
      .where(eq(adminRoleAdminUser.admin_user_id, admin_user_id))
      .catch(this.utils.wrapDbError('AdminUserMutations.deleteAdminUserRoles'))
  }
}
