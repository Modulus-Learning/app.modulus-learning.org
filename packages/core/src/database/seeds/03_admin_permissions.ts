import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { ADMIN_ROLES } from '../bootstrap/reference-data.js'
import { adminPermissions } from '../schema/source/admin-permissions.js'
import type * as schema from '../schema/index.js'

export const seedAdminPermissions = async (
  db: NodePgDatabase<typeof schema>,
  adminRoleIds: { id: string }[]
) => {
  // Permissions for admin roles, in the order seedAdminRoles created them
  console.log('Seed admin permissions start')
  for (const [index, role] of ADMIN_ROLES.entries()) {
    if (role.abilities.length === 0) continue
    await db.insert(adminPermissions).values(
      role.abilities.map((ability) => ({
        id: uuidv7(),
        admin_role_id: adminRoleIds[index]!.id,
        ability,
      }))
    )
  }
  console.log('Seed admin permissions done')
}
