import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { permissions } from '../schema/source/permissions.js'
import type * as schema from '../schema/index.js'

export const seedPermissions = async (
  db: NodePgDatabase<typeof schema>,
  roleIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Permissions for roles
  const grant = (role_id: string, abilities: string[]) =>
    db.insert(permissions).values(
      abilities.map((ability) => ({
        id: uuidv7(),
        role_id,
        ability,
      }))
    )

  console.log('Seed permissions start')
  // Everyone
  await grant(roleIds[0]!.id, [
    'account:read_own',
    'account:edit_own',
    'account:delete_own',
    'profile:read_own',
    'profile:edit_own',
    'profile:delete_own',
  ])

  // Instructors
  await grant(roleIds[1]!.id, [
    'activity_codes:list_own',
    'activity_codes:read_own',
    'activity_codes:create_own',
    'activity_codes:update_own',
    'activity_codes:delete_own',
    'access_dashboard',
  ])

  // Learners?
  // await grant(roleIds[2].id, [

  // ])

  console.log('Seed permissions done')
}
