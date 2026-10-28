import { LMS_CONTRACT_VERSION } from '@/lms/contract.js'
import { CLAIM_CUSTOM, CLAIM_ROLES } from '@/modules/app/lti/constants.js'
import { HttpLtiAgsClient } from '@/modules/app/lti/score-submission/ags-client.js'
import { QuotaGovernor } from '@/modules/app/lti/score-submission/quota-governor.js'
import { CANVAS_CUSTOM_LAUNCH_FIELDS } from './deep-link-fields.js'
import { canvasRegistrationConfig, canvasRegistrationEndpoints } from './registration.js'
import { isInstructor } from './roles.js'
import { inspectCanvasTerm } from './term.js'
import type { LmsAdapter } from '@/lms/contract.js'
import type { RateLimitReading } from '@/modules/app/lti/score-submission/types.js'

export { inspectCanvasTerm, normalizeCanvasTerm } from './term.js'

/**
 * The Canvas LMS adapter. Everything Canvas-specific that core relies on —
 * role interpretation, term metadata, the assignment lock-date fallback, the
 * deep-link substitution variables, registration defaults and developer-key
 * configuration, the AGS transport and Canvas quota pacing — is reached
 * through this object. It becomes `@modulus-learning/lms-canvas`.
 */
export const canvasAdapter = (): LmsAdapter => ({
  id: 'canvas',
  contractVersion: LMS_CONTRACT_VERSION,
  capabilities: { deepLinking: true, termMetadata: true, registrationConfig: true },

  interpretLaunch: (launch) => ({
    isInstructor: isInstructor(launch[CLAIM_ROLES]),
    term: inspectCanvasTerm(launch[CLAIM_CUSTOM]),
    cutoffFallback: launch[CLAIM_CUSTOM]['Canvas.assignment.lockAt.iso8601'],
  }),

  deepLinkCustomFields: () => ({ ...CANVAS_CUSTOM_LAUNCH_FIELDS }),

  registrationEndpoints: canvasRegistrationEndpoints,
  registrationConfig: canvasRegistrationConfig,

  createScoreClient: ({ registration, accessTokens, logger, config }) => {
    const { score_submission } = config.lti
    // One governor per registration-bound client: no pacing state is shared
    // between registrations, as with the previous per-platform governor.
    const governor = new QuotaGovernor(
      Math.max(1, score_submission.max_concurrent_submissions),
      score_submission.quota_reserve_requests,
      score_submission.quota_window_ms,
      score_submission.quota_ramp_interval_ms
    )
    return {
      client: new HttpLtiAgsClient({
        logger,
        config,
        platform: registration,
        accessTokenManager: accessTokens,
      }),
      scheduling: {
        target: () => governor.target(),
        record: (signal) => governor.record(signal as RateLimitReading),
        reset: () => governor.reset(),
      },
    }
  },
})
