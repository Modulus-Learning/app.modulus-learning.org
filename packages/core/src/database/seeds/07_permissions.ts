import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { ROLES } from '../bootstrap/reference-data.js'
import { permissions } from '../schema/source/permissions.js'
import type * as schema from '../schema/index.js'

export const seedPermissions = async (
  db: NodePgDatabase<typeof schema>,
  roleIds: { id: string }[]
) => {
  // Permissions for roles, in the order seedRoles created them
  console.log('Seed permissions start')
  for (const [index, role] of ROLES.entries()) {
    if (role.abilities.length === 0) continue
    await db.insert(permissions).values(
      role.abilities.map((ability) => ({
        id: uuidv7(),
        role_id: roleIds[index]!.id,
        ability,
      }))
    )
  }
  console.log('Seed permissions done')
}
