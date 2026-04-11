import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { roles } from '../schema/source/roles.js'
import type * as schema from '../schema/index.js'

export const seedRoles = async (db: NodePgDatabase<typeof schema>) => {
  // Role data
  const roleData: (typeof roles.$inferInsert)[] = [
    {
      id: uuidv7(),
      name: 'Everyone',
      machine_name: 'everyone',
    },
    {
      id: uuidv7(),
      name: 'Instructor',
      machine_name: 'instructor',
    },
    {
      id: uuidv7(),
      name: 'Learner',
      machine_name: 'learner',
    },
  ]

  console.log('Seed roles start')
  const roleIds = await db.insert(roles).values(roleData).returning({ id: roles.id })
  console.log('Seed roles done')

  return roleIds
}
