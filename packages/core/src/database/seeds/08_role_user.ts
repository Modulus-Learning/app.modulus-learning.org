import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { roleUser } from '../schema/source/role-user.js'
import type * as schema from '../schema/index.js'

export const seedRoleUser = async (
  db: NodePgDatabase<typeof schema>,
  roleIds: { id: string }[],
  userIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Assign users to roles
  const roleUserData: (typeof roleUser.$inferInsert)[] = [
    {
      user_id: userIds[2]!.id, // Alice
      role_id: roleIds[1]!.id, // Instructor
    },
    {
      user_id: userIds[3]!.id, // Bob
      role_id: roleIds[1]!.id, // Instructor
    },
  ]

  // Place everyone in the Everyone role
  for (const user of userIds) {
    // Assign Everyone role
    roleUserData.push({
      user_id: user.id,
      role_id: roleIds[0]!.id, // Everyone
    })
  }

  // Process remaining userIds starting from the 6th element
  // since we've manually seeded the first 5 in 05.users.ts
  const additionalUsers = userIds.slice(5)

  for (const user of additionalUsers) {
    // Assign randomly to Learner (80%) roleIds[2].id or Instructor (20%) roleIds[1].id
    const randomRoleId = Math.random() < 0.8 ? roleIds[2]!.id : roleIds[1]!.id
    roleUserData.push({
      user_id: user.id,
      role_id: randomRoleId,
    })
  }

  console.log('Seed role_user start')
  await db.insert(roleUser).values(roleUserData)
  console.log('Seed role_user done')
}
