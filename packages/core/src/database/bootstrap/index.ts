import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { adminPermissions } from '../schema/source/admin-permissions.js'
import { adminRoleAdminUser } from '../schema/source/admin-role-admin-user.js'
import { adminRoles } from '../schema/source/admin-roles.js'
import { adminUsers } from '../schema/source/admin-users.js'
import { permissions } from '../schema/source/permissions.js'
import { roles } from '../schema/source/roles.js'
import { ADMIN_ROLES, ROLES } from './reference-data.js'
import type * as schema from '../schema/index.js'

/**
 * Production bootstrap. Repeatable and non-destructive: it creates reference
 * roles that are missing, grants their permissions only when it creates them,
 * and never alters or deletes an existing row.
 */

type DB = NodePgDatabase<typeof schema>

export type BootstrapResult = {
  adminRoles: string[]
  roles: string[]
}

export const bootstrapReferenceData = async (db: DB): Promise<BootstrapResult> =>
  db.transaction(async (tx) => {
    const created: BootstrapResult = { adminRoles: [], roles: [] }

    for (const { abilities, ...role } of ADMIN_ROLES) {
      const [row] = await tx
        .insert(adminRoles)
        .values({ id: uuidv7(), ...role })
        .onConflictDoNothing({ target: adminRoles.machine_name })
        .returning({ id: adminRoles.id })
      if (row == null) continue
      created.adminRoles.push(role.machine_name)
      if (abilities.length > 0) {
        await tx
          .insert(adminPermissions)
          .values(abilities.map((ability) => ({ id: uuidv7(), admin_role_id: row.id, ability })))
      }
    }

    for (const { abilities, ...role } of ROLES) {
      const [row] = await tx
        .insert(roles)
        .values({ id: uuidv7(), ...role })
        .onConflictDoNothing({ target: roles.machine_name })
        .returning({ id: roles.id })
      if (row == null) continue
      created.roles.push(role.machine_name)
      if (abilities.length > 0) {
        await tx
          .insert(permissions)
          .values(abilities.map((ability) => ({ id: uuidv7(), role_id: row.id, ability })))
      }
    }

    return created
  })

export type AdministratorInput = {
  email: string
  password: string
  given_name?: string
  family_name?: string
}

/**
 * Create an enabled administrator with the Manager role, whose permissions
 * include `access_admin`; admin abilities come only from roles. Refuses an
 * email already in use, and requires the bootstrap's Manager role.
 */
export const createAdministrator = async (db: DB, input: AdministratorInput): Promise<string> => {
  const password = await argon2.hash(input.password)
  return db.transaction(async (tx) => {
    const [manager] = await tx
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(eq(adminRoles.machine_name, 'manager'))
    if (manager == null) throw new Error('no Manager admin role; run `modulus bootstrap` first')

    const [row] = await tx
      .insert(adminUsers)
      .values({
        id: uuidv7(),
        email: input.email,
        given_name: input.given_name,
        family_name: input.family_name,
        password,
        is_super_admin: true,
        is_enabled: true,
        is_email_verified: true,
      })
      .onConflictDoNothing({ target: adminUsers.email })
      .returning({ id: adminUsers.id })
    if (row == null) throw new Error(`an administrator with email ${input.email} already exists`)

    await tx.insert(adminRoleAdminUser).values({ admin_user_id: row.id, admin_role_id: manager.id })
    return row.id
  })
}
