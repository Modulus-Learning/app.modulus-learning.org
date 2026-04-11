import * as dotenv from 'dotenv'
// /database/seeds/seed.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from '../schema/index.js'
import { activities } from '../schema/source/activities.js'
import { activityCodes } from '../schema/source/activity-codes.js'
import { adminPermissions } from '../schema/source/admin-permissions.js'
import { adminRoleAdminUser } from '../schema/source/admin-role-admin-user.js'
import { adminRoles } from '../schema/source/admin-roles.js'
import { adminUsers } from '../schema/source/admin-users.js'
import { enrollment } from '../schema/source/enrollment.js'
import { permissions } from '../schema/source/permissions.js'
import { progress } from '../schema/source/progress.js'
import { roleUser } from '../schema/source/role-user.js'
import { roles } from '../schema/source/roles.js'
import { users } from '../schema/source/users.js'
import { seedAdminUsers } from './01_admin_users.js'
import { seedAdminRoles } from './02_admin_roles.js'
import { seedAdminPermissions } from './03_admin_permissions.js'
import { seedAdminRoleAdminUser } from './04_admin_user_admin_role.js'
import { seedUsers } from './05_users.js'
import { seedRoles } from './06_roles.js'
import { seedPermissions } from './07_permissions.js'
import { seedRoleUser } from './08_role_user.js'
import { seedActivityCodes } from './09_activity_codes.js'
import { seedActivities } from './10_activities.js'
import { seedEnrollment } from './11_enrollment.js'
import { seedProgress } from './12_progress.js'

dotenv.config({ path: './.env' })

if (!('POSTGRES_CONNECTION_STRING' in process.env))
  throw new Error('POSTGRES_CONNECTION_STRING not found in .env')

const main = async () => {
  const client = new pg.Client({
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
  })

  await client.connect()
  const db = drizzle(client, { schema })

  try {
    await db.delete(progress)
    await db.delete(enrollment)
    await db.delete(activities)
    await db.delete(activityCodes)
    await db.delete(permissions)
    await db.delete(roleUser)
    await db.delete(roles)
    await db.delete(users)

    await db.delete(adminPermissions)
    await db.delete(adminRoleAdminUser)
    await db.delete(adminRoles)
    await db.delete(adminUsers)

    const adminUserIds: { id: string }[] = await seedAdminUsers(db)
    const adminRoleIds: { id: string }[] = await seedAdminRoles(db)
    await seedAdminPermissions(db, adminRoleIds)
    await seedAdminRoleAdminUser(db, adminRoleIds, adminUserIds)

    const userIds: { id: string }[] = await seedUsers(db)
    const roleIds: { id: string }[] = await seedRoles(db)
    await seedPermissions(db, roleIds)
    await seedRoleUser(db, roleIds, userIds)
    const activityCodeIds = await seedActivityCodes(db, userIds)
    const activityIds = await seedActivities(db)
    await seedEnrollment(db, userIds, activityCodeIds, activityIds)
    await seedProgress(db, userIds, activityIds)

    console.log('All seeds completed successfully')
  } catch (error) {
    console.error('Error seeding database:', error)
  } finally {
    await client.end()
  }
}

main()
