import type { RoleRecord, UserRecordWithRoles } from './repository/index.js'
import type { AddUserResponse, Role, User, UserResponse } from './schemas.js'

export const toUser = ({
  id,
  vid,
  username,
  email,
  full_name,
  is_enabled,
  created_at,
  updated_at,
  roles,
}: UserRecordWithRoles): User => ({
  id,
  vid,
  username,
  email,
  full_name: full_name ?? '', // TODO!
  is_enabled,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
  roles,
})

export const toRole = ({
  id,
  order,
  vid,
  name,
  description,
  machine_name,
  created_at,
  updated_at,
}: RoleRecord): Role => ({
  id,
  order,
  vid,
  name,
  description,
  machine_name,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
})

export const toUserResponse = (
  user: UserRecordWithRoles,
  includedRoles: RoleRecord[]
): UserResponse => ({
  user: toUser(user),
  included: {
    roles: includedRoles.map(toRole),
  },
})

export const toAddUserResponse = (includedRoles: RoleRecord[]): AddUserResponse => ({
  included: {
    roles: includedRoles.map(toRole),
  },
})
