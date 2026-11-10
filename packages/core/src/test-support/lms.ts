import {
  CLAIM_CUSTOM,
  CLAIM_ROLES,
  LMS_CONTRACT_VERSION,
  type LmsAdapter,
} from '@modulus-learning/lti'

/**
 * A deliberately non-Canvas LMS adapter. Core tests run against it to prove
 * core needs no Canvas custom fields, term variables, role names, error text,
 * or quota headers. It is an architectural test double, not evidence that any
 * real LMS works.
 */

/** The synthetic platform's instructor role. */
export const SYNTHETIC_INSTRUCTOR_ROLE = 'urn:synthetic:role:teacher'

/** The synthetic platform's own assignment-due field, its cutoff fallback. */
export const SYNTHETIC_DUE_FIELD = 'synthetic.assignment.due'

export const syntheticAdapter = (overrides: Partial<LmsAdapter> = {}): LmsAdapter => ({
  id: 'synthetic',
  contractVersion: LMS_CONTRACT_VERSION,
  capabilities: { deepLinking: true, termMetadata: false, registrationConfig: false },
  interpretLaunch: (launch) => ({
    isInstructor: launch[CLAIM_ROLES].includes(SYNTHETIC_INSTRUCTOR_ROLE),
    term: {
      quality: { term_id: 'missing', name: 'missing', starts_at: 'missing', ends_at: 'missing' },
    },
    cutoffFallback: launch[CLAIM_CUSTOM][SYNTHETIC_DUE_FIELD],
  }),
  deepLinkCustomFields: () => ({}),
  registrationEndpoints: (issuer) => ({
    authorization_endpoint: `${issuer}/oidc/authorize`,
    authorization_server: `${issuer}/oauth/token`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/oidc/jwks`,
  }),
  createScoreClient: ({ registration }) => ({
    client: {
      issuer: registration.issuer,
      publishScore: async () => ({ result: { ok: true } }),
    },
    scheduling: { target: () => 1, record: () => undefined, reset: () => undefined },
  }),
  ...overrides,
})
