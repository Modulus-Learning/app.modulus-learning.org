import type { AgentErrorSlug } from '@/modules/agent/error-slug'

/** Copy for the `/agent/error` page, shared by both hosts' pages. */
export const MESSAGES: Record<AgentErrorSlug, { title: string; message: string }> = {
  invalid_request: {
    title: 'Launch Error',
    message:
      'This activity could not be connected to Modulus. Your work on this page will not be recorded. Please contact your instructor.',
  },
  server_error: {
    title: 'Something Went Wrong',
    message:
      'Something went wrong on our end. This is not a problem with your course link. Please try again shortly.',
  },
}

/**
 * `server_error` is the default for an unknown or absent slug, so an outage
 * never tells the learner their activity is at fault.
 */
export const resolveSlug = (code: string | string[] | undefined): AgentErrorSlug =>
  typeof code === 'string' && Object.hasOwn(MESSAGES, code)
    ? (code as AgentErrorSlug)
    : 'server_error'

/**
 * Answers `200`. This is an App Router page reached by a redirect, not an error
 * response — the failure has already been reported to the caller by the route
 * that sent the learner here.
 */
