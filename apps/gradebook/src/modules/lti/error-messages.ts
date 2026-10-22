import type { LtiErrorSlug } from '@/modules/lti/error-slug'

/** Copy for the `/lti/error` page, shared by both hosts' pages. */
export const MESSAGES: Record<LtiErrorSlug, { title: string; message: string }> = {
  invalid_request: {
    title: 'Launch Error',
    message: 'The launch request was not valid. Please return to your LMS and try again.',
  },
  invalid_launch: {
    title: 'Launch Error',
    message: 'This activity could not be launched. Please contact your instructor.',
  },
  // Reached when the `state-<state>` cookie is missing. That cookie is set
  // `SameSite=None`, so the likeliest cause in practice is a launch rendered
  // inside a Canvas iframe with third-party cookies blocked -- the instructor
  // did not tick "open in a new tab". Detecting and reporting the framed case
  // is deliberately out of scope; this is not a generic fallback.
  session_expired: {
    title: 'Launch Incomplete',
    message:
      'Your launch could not be completed. Please return to your LMS and open the activity again.',
  },
  server_error: {
    title: 'Something Went Wrong',
    message:
      'Something went wrong on our end. This is not a problem with your course link. Please try again shortly.',
  },
}

/**
 * `server_error` is the default for an unknown or absent slug as well as for
 * every core error code the allowlist in `error-slug.ts` does not name, so an
 * outage never tells the learner to contact their instructor.
 */
export const resolveSlug = (code: string | string[] | undefined): LtiErrorSlug =>
  typeof code === 'string' && Object.hasOwn(MESSAGES, code)
    ? (code as LtiErrorSlug)
    : 'server_error'
