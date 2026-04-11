import type { PermissionRecord, RoleRecord } from './repository/index.js'
import type { Permission, Role } from './schemas.js'

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

export const toPermission = ({
  id,
  vid,
  ability,
  created_at,
  updated_at,
}: PermissionRecord): Permission => ({
  id,
  vid,
  ability,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
})
