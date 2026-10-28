import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { ADMIN_ROLES } from '../bootstrap/reference-data.js'
import { adminRoles } from '../schema/source/admin-roles.js'
import type * as schema from '../schema/index.js'

export const seedAdminRoles = async (db: NodePgDatabase<typeof schema>) => {
  // Role data, shared with the production bootstrap
  const adminRoleData: (typeof adminRoles.$inferInsert)[] = ADMIN_ROLES.map(
    ({ abilities: _abilities, ...role }) => ({ id: uuidv7(), ...role })
  )
  console.log('Seed admin roles start')
  const adminRoleIds = await db
    .insert(adminRoles)
    .values(adminRoleData)
    .returning({ id: adminRoles.id })
  console.log('Seed admin roles done')
  return adminRoleIds
}
