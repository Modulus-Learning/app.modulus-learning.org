import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { adminRoleAdminUser } from '../schema/source/admin-role-admin-user.js'
import type * as schema from '../schema/index.js'

export const seedAdminRoleAdminUser = async (
  db: NodePgDatabase<typeof schema>,
  adminRoleIds: { id: string }[],
  adminUserIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Assign users to roles
  const adminRoleAdminUserData: (typeof adminRoleAdminUser.$inferInsert)[] = [
    {
      admin_user_id: adminUserIds[0]!.id, // Bob
      admin_role_id: adminRoleIds[0]!.id, // Manager
    },
    {
      admin_user_id: adminUserIds[1]!.id, // Alice
      admin_role_id: adminRoleIds[1]!.id, // User
    },
  ]

  console.log('Seed admin users in roles')
  await db.insert(adminRoleAdminUser).values(adminRoleAdminUserData)
  console.log('Seed admin users in roles done')
}
