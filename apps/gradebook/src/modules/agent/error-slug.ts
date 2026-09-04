/**
 * The closed set of learner-facing agent authorization failures.
 *
 * Deliberately its own union rather than an extension of `LtiErrorSlug`. That
 * one is the closed set of *launch* failures, and its comment requires every
 * future code to be classified there deliberately; folding a second surface
 * into it would make both sets answerable for each other's members.
 *
 * There are only two, because there are only two things a learner can be told:
 * the request that arrived could not be used, or Modulus had a problem.
 */
export type AgentErrorSlug = 'invalid_request' | 'server_error'

/**
 * `server_error` is the default for an unknown or absent slug, following
 * `/lti/error`'s reasoning: an outage must never blame the learner's course
 * link, or send them to an instructor who cannot help.
 */
export const AGENT_ERROR_SLUGS: readonly AgentErrorSlug[] = ['invalid_request', 'server_error']
