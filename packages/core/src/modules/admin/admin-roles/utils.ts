import type { AdminPermissionRecord, AdminRoleRecord } from './repository/index.js'

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

export const toAdminPermission = ({
  id,
  vid,
  ability,
  created_at,
  updated_at,
}: AdminPermissionRecord) => ({
  id,
  vid,
  ability,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
})
