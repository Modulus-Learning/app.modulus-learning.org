import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { adminUsers } from '../schema/source/admin-users.js'
import type * as schema from '../schema/index.js'

export const seedAdminUsers = async (db: NodePgDatabase<typeof schema>) => {
  const adminUserData: (typeof adminUsers.$inferInsert)[] = [
    {
      id: uuidv7(),
      email: 'bob@modulus.org',
      given_name: 'Bob',
      family_name: 'Builder',
      is_email_verified: true,
      is_enabled: true,
      is_super_admin: true,
      password:
        '$argon2id$v=19$m=65536,t=3,p=4$JpOLJrpSWIzdeuunZcLvYQ$Yb8DDTKxeq6s0cQn+3mhL/RjKT6Yv2iwYkEIH80ZdtU',
    },
    {
      id: uuidv7(),
      email: 'alice@modulus.org',
      given_name: 'Alice',
      family_name: 'Wonderland',
      is_email_verified: true,
      is_enabled: true,
      password:
        '$argon2id$v=19$m=65536,t=3,p=4$JpOLJrpSWIzdeuunZcLvYQ$Yb8DDTKxeq6s0cQn+3mhL/RjKT6Yv2iwYkEIH80ZdtU',
    },
  ]

  console.log('Seed admin users start')
  const adminUserIds = await db
    .insert(adminUsers)
    .values(adminUserData)
    .returning({ id: adminUsers.id })
  console.log('Seed admin users done')

  return adminUserIds
}
