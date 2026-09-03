import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  ACTIVITY_URL_NOT_ALLOWED: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
} as const

/**
 * Raised when a caller asked to register one or more activity URLs the sitewide
 * allowlist does not admit.
 *
 * It lives in this module rather than in `app/activities`, `app/lti` or
 * `agent/auth` because all three raise it and none of them owns the concept.
 *
 * `warn`, not `error`: it is caused by user input, like every other domain
 * error in core that a caller can provoke by typing something.
 *
 * Its `details` must carry every rejected URL with its reason —
 * `{ rejected: Array<{ url, reason }> }` — because a caller has to be able to
 * name each offending URL back to the person who submitted it, and a message
 * string cannot meet that.
 */
export const ERR_ACTIVITY_URL_NOT_ALLOWED = createCoreErrorType(
  ErrorCodes.ACTIVITY_URL_NOT_ALLOWED,
  'warn'
)
