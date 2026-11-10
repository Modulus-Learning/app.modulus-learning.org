import type {
  RoleRecord,
  UserRecordWithRoles,
  UserRecordWithRolesAndLti,
} from './repository/index.js'
import type { AddUserResponse, LtiIdentity, Role, User, UserResponse } from './schemas.js'

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

/**
 * The stored LTI identity, or null when neither column is set. A half-set pair
 * is returned with `linked: false`, matching the sign-in code, which treats it
 * as unlinked.
 */
export const toLtiIdentity = ({
  lti_iss,
  lti_sub,
}: Pick<UserRecordWithRolesAndLti, 'lti_iss' | 'lti_sub'>): LtiIdentity | null =>
  lti_iss == null && lti_sub == null
    ? null
    : { issuer: lti_iss, subject: lti_sub, linked: lti_iss != null && lti_sub != null }

export const toUserResponse = (
  { lti_iss, lti_sub, ...user }: UserRecordWithRolesAndLti,
  includedRoles: RoleRecord[]
): UserResponse => ({
  user: toUser(user),
  included: {
    roles: includedRoles.map(toRole),
    lti: toLtiIdentity({ lti_iss, lti_sub }),
  },
})

export const toAddUserResponse = (includedRoles: RoleRecord[]): AddUserResponse => ({
  included: {
    roles: includedRoles.map(toRole),
  },
})
