import type { AdminRoleRecord, AdminUserRecordWithRoles } from './repository/index.js'
import type { AddAdminUserResponse, AdminUserResponse } from './schemas.js'

export const toAdminUser = ({
  id,
  vid,
  username,
  email,
  given_name,
  family_name,
  is_enabled,
  created_at,
  updated_at,
  roles,
}: AdminUserRecordWithRoles) => ({
  id,
  vid,
  username,
  email: email ?? '', // TODO!
  given_name: given_name ?? '', // TODO!
  family_name: family_name ?? '', // TODO!
  is_enabled,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
  roles,
})

export const toAdminRole = ({
  id,
  order,
  vid,
  name,
  description,
  machine_name,
  created_at,
  updated_at,
}: AdminRoleRecord) => ({
  id,
  order,
  vid,
  name,
  description,
  machine_name,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
})

export const toAdminUserResponse = (
  adminUser: AdminUserRecordWithRoles,
  includedRoles: AdminRoleRecord[]
): AdminUserResponse => ({
  user: toAdminUser(adminUser),
  included: {
    roles: includedRoles.map(toAdminRole),
  },
})

export const toAddAdminUserResponse = (includedRoles: AdminRoleRecord[]): AddAdminUserResponse => ({
  included: {
    roles: includedRoles.map(toAdminRole),
  },
})
