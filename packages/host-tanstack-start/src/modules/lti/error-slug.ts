/**
 * Core error codes that mean the launch itself is bad -- a malformed or
 * unrecognised login/launch, not a fault on our side. Everything not listed
 * here is treated as an internal failure.
 *
 * This list is deliberately an allowlist. Core has many internal error codes
 * (ERR_JWT_ENCODE, ERR_OUTPUT_VALIDATION, ERR_ASSERTION, ERR_UNIQUE_CONSTRAINT,
 * ...) and gains more over time; a denylist would silently misclassify each new
 * one as the learner's problem. Forgetting to add a *domain* code here is safe
 * -- the learner is told we had a problem. Forgetting to add an *internal* code
 * to a denylist is not -- the learner is sent to their instructor over an
 * outage.
 *
 * Any future domain code added to core's LTI module must be added here
 * deliberately, with the classification stated in its review.
 */
const LAUNCH_FAULT_CODES = new Set(['ERR_INVALID_LOGIN', 'ERR_INVALID_LAUNCH'])

/**
 * A request that fails core's own input schema is a malformed request, not a
 * bad course link, so it is classified apart from the launch faults above.
 */
const REQUEST_FAULT_CODES = new Set(['ERR_VALIDATION'])

export type LtiErrorSlug = 'invalid_request' | 'invalid_launch' | 'session_expired' | 'server_error'

export const errorSlugFor = (
  code: string
): 'invalid_launch' | 'invalid_request' | 'server_error' => {
  if (LAUNCH_FAULT_CODES.has(code)) return 'invalid_launch'
  if (REQUEST_FAULT_CODES.has(code)) return 'invalid_request'
  return 'server_error'
}
