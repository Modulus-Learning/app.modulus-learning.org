import type { AccountRecord, RoleRecord } from './repository/index.js'
import type { AccountResponse } from './schemas.js'

export const toAccountResponse = (
  user: AccountRecord,
  includedRoles: RoleRecord[]
): AccountResponse => {
  const {
    id,
    vid,
    given_name,
    family_name,
    has_password,
    email,
    last_login,
    is_enabled,
    created_at,
    updated_at,
    roles,
  } = user

  return {
    user: {
      id,
      vid,
      given_name,
      family_name,
      has_password,
      email,
      last_login: last_login?.toISOString() ?? null,
      is_enabled,
      roles,
      created_at: created_at?.toISOString(),
      updated_at: updated_at?.toISOString(),
    },
    included: {
      roles: includedRoles.map(
        ({ id, order, vid, name, description, machine_name, created_at, updated_at }) => ({
          id,
          order,
          vid,
          name,
          description,
          machine_name,
          created_at: created_at.toISOString(),
          updated_at: updated_at.toISOString(),
        })
      ),
    },
  }
}
