import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { adminRoles } from '../schema/source/admin-roles.js'
import type * as schema from '../schema/index.js'

export const seedAdminRoles = async (db: NodePgDatabase<typeof schema>) => {
  // Role data
  const adminRoleData: (typeof adminRoles.$inferInsert)[] = [
    {
      id: uuidv7(),
      name: 'Manager',
      machine_name: 'manger',
      description: 'Manager role. Can create and delete all rows.',
    },
    {
      id: uuidv7(),
      name: 'User',
      machine_name: 'user',
      description: 'User role. Can create users and other rows but cannot delete.',
    },
    {
      id: uuidv7(),
      name: 'Guest',
      machine_name: 'guest',
      description: 'Read only guest role.',
    },
  ]

  console.log('Seed admin roles start')
  const adminRoleIds = await db
    .insert(adminRoles)
    .values(adminRoleData)
    .returning({ id: adminRoles.id })
  console.log('Seed admin roles done')

  return adminRoleIds
}
