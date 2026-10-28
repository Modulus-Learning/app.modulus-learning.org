import {
  CLAIM_CUSTOM,
  CLAIM_ROLES,
  LMS_CONTRACT_VERSION,
  type LmsAdapter,
} from '@modulus-learning/lti'

import { HttpLtiAgsClient } from './ags-client.js'
import { CANVAS_CUSTOM_LAUNCH_FIELDS } from './deep-link-fields.js'
import { QuotaGovernor } from './quota-governor.js'
import { canvasRegistrationConfig, canvasRegistrationEndpoints } from './registration.js'
import { isInstructor } from './roles.js'
import { inspectCanvasTerm } from './term.js'
import type { RateLimitReading } from './types.js'

/**
 * The Canvas LMS adapter. Everything Canvas-specific that core relies on —
 * role interpretation, term metadata, the assignment lock-date fallback, the
 * deep-link substitution variables, registration defaults and developer-key
 * configuration, the AGS transport and Canvas quota pacing — is reached
 * through this object.
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

  createScoreClient: ({ registration, accessTokens, logger, settings }) => {
    // One governor per registration-bound client: no pacing state is shared
    // between registrations.
    const governor = new QuotaGovernor(
      Math.max(1, settings.maxConcurrentSubmissions),
      settings.quotaReserveRequests,
      settings.quotaWindowMs,
      settings.quotaRampIntervalMs
    )
    return {
      client: new HttpLtiAgsClient({
        logger,
        registration,
        accessTokens,
        requestTimeoutSeconds: settings.requestTimeoutSeconds,
      }),
      scheduling: {
        target: () => governor.target(),
        record: (signal) => governor.record(signal as RateLimitReading),
        reset: () => governor.reset(),
      },
    }
  },
})
