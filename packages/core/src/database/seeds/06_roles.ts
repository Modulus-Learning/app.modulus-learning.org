import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { ROLES } from '../bootstrap/reference-data.js'
import { roles } from '../schema/source/roles.js'
import type * as schema from '../schema/index.js'

export const seedRoles = async (db: NodePgDatabase<typeof schema>) => {
  // Role data, shared with the production bootstrap
  const roleData: (typeof roles.$inferInsert)[] = ROLES.map(
    ({ abilities: _abilities, ...role }) => ({ id: uuidv7(), ...role })
  )
  console.log('Seed roles start')
  const roleIds = await db.insert(roles).values(roleData).returning({ id: roles.id })
  console.log('Seed roles done')
  return roleIds
}
