import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { adminPermissions } from '../schema/source/admin-permissions.js'
import type * as schema from '../schema/index.js'

export const seedAdminPermissions = async (
  db: NodePgDatabase<typeof schema>,
  adminRoleIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Permissions for admin roles
  const grant = (admin_role_id: string, abilities: string[]) =>
    db.insert(adminPermissions).values(
      abilities.map((ability) => ({
        id: uuidv7(),
        admin_role_id,
        ability,
      }))
    )

  console.log('Seed admin permissions start')
  // Manger
  await grant(adminRoleIds[0]!.id, [
    'account:read_own',
    'account:edit_own',
    'account:delete_own',
    'users:list',
    'users:read',
    'users:create',
    'users:edit',
    'users:delete',
    'roles:list',
    'roles:read',
    'roles:create',
    'roles:edit',
    'roles:delete',
    'admin-users:list',
    'admin-users:read',
    'admin-users:create',
    'admin-users:edit',
    'admin-users:delete',
    'admin-roles:list',
    'admin-roles:read',
    'admin-roles:create',
    'admin-roles:edit',
    'admin-roles:delete',
    'reports:list',
    'reports:read',
    'access_admin',
  ])

  // User
  await grant(adminRoleIds[1]!.id, [
    'account:read_own',
    'account:edit_own',
    'account:delete_own',
    'users:list',
    'users:read',
    'users:create',
    'users:edit',
    'roles:list',
    'roles:read',
    'roles:create',
    'roles:edit',
    'reports:list',
    'reports:read',
    'access_admin',
  ])

  // Guest
  await grant(adminRoleIds[2]!.id, [
    'account:read_own',
    'account:edit_own',
    'account:delete_own',
    'users:list',
    'users:read',
    'roles:list',
    'roles:read',
    'reports:list',
    'reports:read',
    'access_admin',
  ])

  console.log('Seed admin permissions done')
}
