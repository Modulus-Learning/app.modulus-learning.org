/**
 * The Next server-action modules the action bridge may run on Start, keyed by
 * module path. Only listed modules and their named exports are reachable; each
 * entry also fixes the surface the call must arrive through. `?original`
 * bypasses the module's own `.start.ts` override (see `vite.config.ts`).
 * Removed in Task 18 as the actions become native server functions.
 */
export type BridgeSurface = 'app' | 'admin'

export const ACTION_REGISTRY: Record<
  string,
  { surface: BridgeSurface; load: () => Promise<Record<string, unknown>> }
> = {
  'app/account/change-email': {
    surface: 'app',
    load: () => import('@/modules/app/account/change-email.ts?original'),
  },
  'app/account/change-password': {
    surface: 'app',
    load: () => import('@/modules/app/account/change-password.ts?original'),
  },
  'app/account/edit-full-name': {
    surface: 'app',
    load: () => import('@/modules/app/account/edit-full-name.ts?original'),
  },
  'app/account/set-password': {
    surface: 'app',
    load: () => import('@/modules/app/account/set-password.ts?original'),
  },
  'app/account/get-account': {
    surface: 'app',
    load: () => import('@/modules/app/account/get-account.ts?original'),
  },
  'app/activities/add-activity-code-member': {
    surface: 'app',
    load: () => import('@/modules/app/activities/add-activity-code-member.ts?original'),
  },
  'app/activities/create-activity-code': {
    surface: 'app',
    load: () => import('@/modules/app/activities/create-activity-code.ts?original'),
  },
  'app/activities/delete-activity-code': {
    surface: 'app',
    load: () => import('@/modules/app/activities/delete-activity-code.ts?original'),
  },
  'app/activities/list-activity-code-members': {
    surface: 'app',
    load: () => import('@/modules/app/activities/list-activity-code-members.ts?original'),
  },
  'app/activities/remove-activity-code-member': {
    surface: 'app',
    load: () => import('@/modules/app/activities/remove-activity-code-member.ts?original'),
  },
  'app/activities/request-activity-code': {
    surface: 'app',
    load: () => import('@/modules/app/activities/request-activity-code.ts?original'),
  },
  'app/activities/search-instructors': {
    surface: 'app',
    load: () => import('@/modules/app/activities/search-instructors.ts?original'),
  },
  'app/activities/update-activity-code': {
    surface: 'app',
    load: () => import('@/modules/app/activities/update-activity-code.ts?original'),
  },
  'app/activities/get-activities': {
    surface: 'app',
    load: () => import('@/modules/app/activities/get-activities.ts?original'),
  },
  'app/activities/get-activity-code': {
    surface: 'app',
    load: () => import('@/modules/app/activities/get-activity-code.ts?original'),
  },
  'app/activities/get-activity-codes': {
    surface: 'app',
    load: () => import('@/modules/app/activities/get-activity-codes.ts?original'),
  },
  'app/activities/get-progress': {
    surface: 'app',
    load: () => import('@/modules/app/activities/get-progress.ts?original'),
  },
  'admin/account/change-email': {
    surface: 'admin',
    load: () => import('@/modules/admin/account/change-email.ts?original'),
  },
  'admin/account/change-password': {
    surface: 'admin',
    load: () => import('@/modules/admin/account/change-password.ts?original'),
  },
  'admin/account/edit-full-name': {
    surface: 'admin',
    load: () => import('@/modules/admin/account/edit-full-name.ts?original'),
  },
  'admin/account/get-account': {
    surface: 'admin',
    load: () => import('@/modules/admin/account/get-account.ts?original'),
  },
  'admin/activity-url-allowlist/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/create.ts?original'),
  },
  'admin/activity-url-allowlist/delete': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/delete.ts?original'),
  },
  'admin/activity-url-allowlist/edit': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/edit.ts?original'),
  },
  'admin/activity-url-allowlist/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/get.ts?original'),
  },
  'admin/activity-url-allowlist/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/list.ts?original'),
  },
  'admin/activity-url-allowlist/preview': {
    surface: 'admin',
    load: () => import('@/modules/admin/activity-url-allowlist/preview.ts?original'),
  },
  'admin/admin-roles/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/create.ts?original'),
  },
  'admin/admin-roles/delete': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/delete.ts?original'),
  },
  'admin/admin-roles/edit': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/edit.ts?original'),
  },
  'admin/admin-roles/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/get.ts?original'),
  },
  'admin/admin-roles/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/list.ts?original'),
  },
  'admin/admin-roles/order': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-roles/order.ts?original'),
  },
  'admin/admin-users/add': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/add.ts?original'),
  },
  'admin/admin-users/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/create.ts?original'),
  },
  'admin/admin-users/delete': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/delete.ts?original'),
  },
  'admin/admin-users/edit': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/edit.ts?original'),
  },
  'admin/admin-users/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/get.ts?original'),
  },
  'admin/admin-users/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/admin-users/list.ts?original'),
  },
  'admin/dashboard/getMonthlyActiveUsers': {
    surface: 'admin',
    load: () => import('@/modules/admin/dashboard/getMonthlyActiveUsers.ts?original'),
  },
  'admin/dashboard/getNewVsReturningUser': {
    surface: 'admin',
    load: () => import('@/modules/admin/dashboard/getNewVsReturningUser.ts?original'),
  },
  'admin/dashboard/getRegistrationsPerDay': {
    surface: 'admin',
    load: () => import('@/modules/admin/dashboard/getRegistrationsPerDay.ts?original'),
  },
  'admin/dashboard/getRegistrationsPerMonth': {
    surface: 'admin',
    load: () => import('@/modules/admin/dashboard/getRegistrationsPerMonth.ts?original'),
  },
  'admin/dashboard/getTotalRegisteredUsers': {
    surface: 'admin',
    load: () => import('@/modules/admin/dashboard/getTotalRegisteredUsers.ts?original'),
  },
  'admin/lti-platforms/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/lti-platforms/create.ts?original'),
  },
  'admin/lti-platforms/generate-canvas-config': {
    surface: 'admin',
    load: () => import('@/modules/admin/lti-platforms/generate-canvas-config.ts?original'),
  },
  'admin/lti-platforms/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/lti-platforms/get.ts?original'),
  },
  'admin/lti-platforms/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/lti-platforms/list.ts?original'),
  },
  'admin/roles/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/create.ts?original'),
  },
  'admin/roles/delete': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/delete.ts?original'),
  },
  'admin/roles/edit': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/edit.ts?original'),
  },
  'admin/roles/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/get.ts?original'),
  },
  'admin/roles/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/list.ts?original'),
  },
  'admin/roles/order': {
    surface: 'admin',
    load: () => import('@/modules/admin/roles/order.ts?original'),
  },
  'admin/users/add': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/add.ts?original'),
  },
  'admin/users/create': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/create.ts?original'),
  },
  'admin/users/delete': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/delete.ts?original'),
  },
  'admin/users/edit': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/edit.ts?original'),
  },
  'admin/users/get': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/get.ts?original'),
  },
  'admin/users/list': {
    surface: 'admin',
    load: () => import('@/modules/admin/users/list.ts?original'),
  },
}
