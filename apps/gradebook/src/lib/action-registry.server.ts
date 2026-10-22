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
}
