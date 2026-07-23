import type { Config } from '@/config.js'

// The slice of `lti.score_submission` the submitter path actually reads
// (`processOne` -> `recordResult` -> `computeBackoffMs`). Kept as explicit test
// values rather than the env-loaded config so the integration assertions --
// "throttled forward", "backed off into the future" -- have known magnitudes.
const scoreSubmission = {
  lease_duration_seconds: 120,
  throttle_seconds: 300,
  backoff_base_seconds: 5,
  backoff_error_cap: 5,
  request_timeout_seconds: 60,
}

/**
 * A minimal `Config` carrying just the `lti.score_submission` knobs the
 * submitter reads. Cast through `unknown` because the integration tests never
 * touch the rest of the config surface.
 */
export const testConfig = {
  lti: { score_submission: scoreSubmission },
} as unknown as Config
