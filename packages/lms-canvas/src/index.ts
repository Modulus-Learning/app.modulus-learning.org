/**
 * `@modulus-learning/lms-canvas` — the Canvas LMS adapter for Modulus. Pass
 * `canvasAdapter()` to the host's server configuration.
 */
export { canvasAdapter } from './adapter.js'
export { type FetchFn, HttpLtiAgsClient } from './ags-client.js'
export { CANVAS_CUSTOM_LAUNCH_FIELDS } from './deep-link-fields.js'
export { classifyScoreSubmissionResponse } from './error-classifier.js'
export { QuotaGovernor } from './quota-governor.js'
export { canvasRegistrationConfig, canvasRegistrationEndpoints } from './registration.js'
export { INSTRUCTOR_LTI_ROLES, isInstructor } from './roles.js'
export { inspectCanvasTerm, normalizeCanvasTerm } from './term.js'
export type { RateLimitReading } from './types.js'
