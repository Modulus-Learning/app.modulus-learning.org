/**
 * Browser-safe entry point for the pure activity URL helpers.
 *
 * The package root re-exports these too, but it also re-exports `initCore`,
 * whose module graph reaches the database driver, the logger, and mail
 * transport. A client component importing the root would pull all of that into
 * the browser bundle. This subpath resolves to `activity-url.ts` alone, which
 * is deliberately free of any such import.
 */
export {
  type InstructorActivityUrlResult,
  matchesActivityUrlPrefix,
  normalizeActivityUrl,
  validateInstructorActivityUrl,
} from '@/modules/activity-registration/activity-url.js'
