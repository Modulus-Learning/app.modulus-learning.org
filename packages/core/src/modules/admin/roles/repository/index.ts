import { eq, inArray, sql } from 'drizzle-orm'

import { permissions, roles } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type RoleRecord = typeof roles.$inferSelect
export type RoleInsert = typeof roles.$inferInsert
export type RoleVersionForUpdate = Pick<RoleRecord, 'id' | 'vid' | 'machine_name'>

export type PermissionRecord = typeof permissions.$inferSelect
export type PermissionInsert = typeof permissions.$inferInsert

export class RoleQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'roles')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getRoleList(): Promise<RoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(roles)
      .orderBy(roles.order)
      .catch(this.utils.wrapDbError('RoleQueries.getRoleList'))
  }

  @method
  async getRole(id: string): Promise<RoleRecord | undefined> {
    return await this.db
      .get()
      .query.roles.findFirst({ where: eq(roles.id, id) })
      .catch(this.utils.wrapDbError('RoleQueries.getRole'))
  }

  @method
  async getPermissionsForRole(role_id: string): Promise<PermissionRecord[]> {
    return await this.db
      .get()
      .query.permissions.findMany({
        where: eq(permissions.role_id, role_id),
      })
      .catch(this.utils.wrapDbError('RoleQueries.getPermissionsForRole'))
  }

  @method
  async findRoleByMachineName(machine_name: string): Promise<RoleRecord | undefined> {
    return await this.db
      .get()
      .query.roles.findFirst({
        where: eq(roles.machine_name, machine_name),
      })
      .catch(this.utils.wrapDbError('RoleQueries.findRoleByMachineName'))
  }
}

export class RoleMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'roles')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getRoleForUpdate(id: string): Promise<RoleVersionForUpdate | undefined> {
    const [role] = await this.db
      .get()
      .select({ id: roles.id, vid: roles.vid, machine_name: roles.machine_name })
      .from(roles)
      .for('update')
      .where(eq(roles.id, id))
      .catch(this.utils.wrapDbError('RoleMutations.getRoleForUpdate'))

    return role
  }

  @method
  async createRole(data: RoleInsert): Promise<RoleRecord> {
    const [role] = await this.db
      .get()
      .insert(roles)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbError('RoleMutations.createRole'))

    this.utils.assertExists(role, { message: 'newly created admin role is null' })

    return role
  }

  @method
  async updateRole(id: string, data: Partial<RoleInsert>): Promise<RoleRecord | undefined> {
    const [updatedRole] = await this.db
      .get()
      .update(roles)
      .set(data)
      .where(eq(roles.id, id))
      .returning()
      .catch(this.utils.wrapDbError('RoleMutations.updateRole'))

    return updatedRole
  }

  @method
  async deleteRole(id: string): Promise<void> {
    await this.db
      .get()
      .delete(roles)
      .where(eq(roles.id, id))
      .catch(this.utils.wrapDbError('RoleMutations.deleteRole'))
  }

  @method
  async setRolesOrder(ids: string[]): Promise<void> {
    if (ids.length === 0) return

    // Create an sql update statement of the form
    //   UPDATE roles
    //   SET order = (CASE
    //       WHEN roles.id = 'uuid-number-one' THEN 0
    //       WHEN roles.id = 'uuid-number-two' THEN 1
    //       ELSE 0
    //     END)
    //   WHERE roles.id IN ('uuid-number-one', 'uuid-number-two');
    // For very long arrays this might be inefficient (?) but for relatively
    // short arrays this lets us update every row in a single SQL statement.
    // The ELSE 0 clause is needed to ensure that the parenthesized update
    // expression has type INTEGER (without it, whether due to a problem with
    // drizzle or a more general sql/postgresql oddity, the value being
    // assigned to the 'order' field is inferred as being of type TEXT).
    const update = sql.join(
      [
        sql`(CASE`,
        ...ids.map((id, index) => sql`WHEN ${roles.id} = ${id} THEN ${index}`),
        sql`ELSE 0 END)`,
      ],
      sql` `
    )

    await this.db
      .get()
      .update(roles)
      .set({ order: update })
      .where(inArray(roles.id, ids))
      .execute()
      .catch(this.utils.wrapDbError('RoleMutations.setRolesOrder'))
  }
}
