/**
 * The roles and permissions every installation starts with. The production
 * bootstrap and the development seeds both read these, so the two cannot
 * drift.
 */

export type RoleDefinition = {
  name: string
  machine_name: string
  description?: string
  abilities: readonly string[]
}

export const ADMIN_ROLES: readonly RoleDefinition[] = [
  {
    name: 'Manager',
    machine_name: 'manager',
    description: 'Manager role. Can create and delete all rows.',
    abilities: [
      'account:read_own',
      'account:edit_own',
      'account:delete_own',
      'users:list',
      'users:read',
      'users:create',
      'users:edit',
      'users:delete',
      'roles:list',
      'roles:read',
      'roles:create',
      'roles:edit',
      'roles:delete',
      'admin-users:list',
      'admin-users:read',
      'admin-users:create',
      'admin-users:edit',
      'admin-users:delete',
      'admin-roles:list',
      'admin-roles:read',
      'admin-roles:create',
      'admin-roles:edit',
      'admin-roles:delete',
      'lti-platforms:list',
      'lti-platforms:create',
      'activity-url-allowlist:list',
      'activity-url-allowlist:manage',
      'reports:list',
      'reports:read',
      'access_admin',
    ],
  },
  {
    name: 'User',
    machine_name: 'user',
    description: 'User role. Can create users and other rows but cannot delete.',
    abilities: [
      'account:read_own',
      'account:edit_own',
      'account:delete_own',
      'users:list',
      'users:read',
      'users:create',
      'users:edit',
      'roles:list',
      'roles:read',
      'roles:create',
      'roles:edit',
      'reports:list',
      'reports:read',
      'access_admin',
    ],
  },
  {
    name: 'Guest',
    machine_name: 'guest',
    description: 'Read only guest role.',
    abilities: [
      'account:read_own',
      'account:edit_own',
      'account:delete_own',
      'users:list',
      'users:read',
      'roles:list',
      'roles:read',
      'reports:list',
      'reports:read',
      'access_admin',
    ],
  },
]

export const ROLES: readonly RoleDefinition[] = [
  {
    name: 'Everyone',
    machine_name: 'everyone',
    abilities: [
      'account:read_own',
      'account:edit_own',
      'account:delete_own',
      'profile:read_own',
      'profile:edit_own',
      'profile:delete_own',
    ],
  },
  {
    name: 'Instructor',
    machine_name: 'instructor',
    abilities: [
      'activity_codes:list_own',
      'activity_codes:read_own',
      'activity_codes:create_own',
      'activity_codes:update_own',
      'activity_codes:delete_own',
      'access_dashboard',
    ],
  },
  {
    name: 'Learner',
    machine_name: 'learner',
    abilities: [],
  },
]
