import { eq, inArray, sql } from 'drizzle-orm'

import { adminPermissions, adminRoles } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type AdminRoleRecord = typeof adminRoles.$inferSelect
export type AdminRoleInsert = typeof adminRoles.$inferInsert
export type AdminRoleVersionForUpdate = Pick<AdminRoleRecord, 'id' | 'vid' | 'machine_name'>

export type AdminPermissionRecord = typeof adminPermissions.$inferSelect
export type AdminPermissionInsert = typeof adminPermissions.$inferInsert

export class AdminRoleQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'admin-roles')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAdminRoleList(): Promise<AdminRoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(adminRoles)
      .orderBy(adminRoles.order)
      .catch(this.utils.wrapDbError('AdminRoleQueries.getAdminRoleList'))
  }

  @method
  async getAdminRole(id: string): Promise<AdminRoleRecord | undefined> {
    return await this.db
      .get()
      .query.adminRoles.findFirst({ where: eq(adminRoles.id, id) })
      .catch(this.utils.wrapDbError('AdminRoleQueries.getAdminRole'))
  }

  @method
  async getPermissionsForAdminRole(admin_role_id: string): Promise<AdminPermissionRecord[]> {
    return await this.db
      .get()
      .query.adminPermissions.findMany({
        where: eq(adminPermissions.admin_role_id, admin_role_id),
      })
      .catch(this.utils.wrapDbError('AdminRoleQueries.getPermissionsForAdminRole'))
  }

  @method
  async findAdminRoleByMachineName(machine_name: string): Promise<AdminRoleRecord | undefined> {
    return await this.db
      .get()
      .query.adminRoles.findFirst({
        where: eq(adminRoles.machine_name, machine_name),
      })
      .catch(this.utils.wrapDbError('AdminRoleQueries.findAdminRoleByMachineName'))
  }
}

export class AdminRoleMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'admin-roles')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getAdminRoleForUpdate(id: string): Promise<AdminRoleVersionForUpdate | undefined> {
    const [adminRole] = await this.db
      .get()
      .select({ id: adminRoles.id, vid: adminRoles.vid, machine_name: adminRoles.machine_name })
      .from(adminRoles)
      .for('update')
      .where(eq(adminRoles.id, id))
      .catch(this.utils.wrapDbError('AdminRoleMutations.getAdminRoleForUpdate'))

    return adminRole
  }

  @method
  async createAdminRole(data: AdminRoleInsert): Promise<AdminRoleRecord> {
    const [adminRole] = await this.db
      .get()
      .insert(adminRoles)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbError('AdminRoleMutations.createAdminRole'))

    this.utils.assertExists(adminRole, { message: 'newly created admin role is null' })

    return adminRole
  }

  @method
  async updateAdminRole(
    id: string,
    data: Partial<AdminRoleInsert>
  ): Promise<AdminRoleRecord | undefined> {
    const [updatedAdminRole] = await this.db
      .get()
      .update(adminRoles)
      .set(data)
      .where(eq(adminRoles.id, id))
      .returning()
      .catch(this.utils.wrapDbError('AdminRoleMutations.updateAdminRole'))

    return updatedAdminRole
  }

  @method
  async deleteAdminRole(id: string): Promise<void> {
    await this.db
      .get()
      .delete(adminRoles)
      .where(eq(adminRoles.id, id))
      .catch(this.utils.wrapDbError('AdminRoleMutations.deleteAdminRole'))
  }

  @method
  async setAdminRolesOrder(ids: string[]): Promise<void> {
    if (ids.length === 0) return

    // Create an sql update statement of the form
    //   UPDATE admin_roles
    //   SET order = (CASE
    //       WHEN admin_roles.id = 'uuid-number-one' THEN CAST(0 AS INTEGER)
    //       WHEN admin_roles.id = 'uuid-number-two' THEN CAST(1 AS INTEGER)
    //       ELSE 0
    //     END)
    //   WHERE admin_roles.id IN ('uuid-number-one', 'uuid-number-two');
    // For very long arrays this might be inefficient (?) but for relatively
    // short arrays this lets us update every row in a single SQL statement.
    // The ELSE 0 clause is necessary, to ensure that in all cases the
    // parenthesized update expression has type INTEGER.
    const update = sql.join(
      [
        sql`(CASE`,
        ...ids.map((id, index) => sql`WHEN ${adminRoles.id} = ${id} THEN ${index}`),
        sql`ELSE 0 END)`,
      ],
      sql` `
    )

    await this.db
      .get()
      .update(adminRoles)
      .set({ order: update })
      .where(inArray(adminRoles.id, ids))
      .execute()
      .catch(this.utils.wrapDbError('AdminRoleMutations.setAdminRolesOrder'))
  }
}
