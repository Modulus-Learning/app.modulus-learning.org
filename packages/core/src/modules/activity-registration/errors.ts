import { createCoreErrorType } from '@/lib/errors.js'
import type { RejectedRegistration } from './schemas.js'

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

/**
 * Raises the denial with a `details.rejected` of the right shape.
 *
 * `CoreErrorOptions.details` is `Record<string, unknown>`, so nothing would
 * otherwise check that what goes in matches what the host reads back out.
 * Every throw site and every reader agrees through this function rather than
 * by review.
 *
 * **Never call `.log()` on the result.** `details.rejected` carries whole URLs
 * -- query string and fragment included -- and `CoreError.log()` spreads
 * `details` directly into the log record, which would put a learner's
 * `redirect_uri` or an instructor's authored query values in the log. The
 * sanctioned denial diagnostic is `ActivityRegistrationService.register()`'s
 * warn line, which carries the normalized origin and path and nothing else. A
 * caller that wants to record an aggregate should log its own line with counts
 * and reasons, never the URLs.
 *
 * The full URLs stay in `details` because the host needs them to tell the
 * submitter which lines to fix; they are for the response, not the log.
 */
export const activityUrlNotAllowed = (rejected: RejectedRegistration[]) =>
  ERR_ACTIVITY_URL_NOT_ALLOWED(
    {
      message:
        rejected.length === 1
          ? 'This activity URL is not allowed by the sitewide allowlist.'
          : `${rejected.length} activity URLs are not allowed by the sitewide allowlist.`,
      details: { rejected },
    },
    activityUrlNotAllowed
  )
