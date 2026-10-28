import { base64Schema, booleanSchema, urlSchema } from '@infonomic/schemas'
import { z } from 'zod'

export interface UrlBuilder {
  baseUrl: string
  ltiLaunchUrl: string
  dashboardUrl: string
}

/** True when any leaf of a (possibly nested) plain object is defined. */
const hasAnyDefinedLeaf = (value: unknown): boolean => {
  if (value == null) return false
  if (typeof value !== 'object') return true
  return Object.values(value).some(hasAnyDefinedLeaf)
}

export const configSchema = z.object({
  server: z.object({
    host: z.string(),
    baseUrl: urlSchema,
  }),
  jwt: z.object({
    privateKey: base64Schema.transform((val) => val.toString('utf-8')),
    publicKey: base64Schema.transform((val) => val.toString('utf-8')),
    audience: z.string(),
    issuer: z.string(),
    expires: z.object({
      access: z.coerce.number(),
      refresh: z.coerce.number(),
      agent: z.coerce.number(),
    }),
    agent: z.object({
      renewAfterSeconds: z.coerce.number().default(60),
    }),
  }),
  jobs: z.object({
    // How often the housekeeping worker prunes short-lived tables (seconds).
    housekeepingIntervalSeconds: z.coerce.number().default(3600),
  }),
  postgres: z.object({
    connectionString: z.string(),
    // Boot-time comparison of the script ledger with the shipped release
    // scripts: refuse to start, only log, or skip.
    schemaCheck: z.enum(['enforce', 'warn', 'off']).default('enforce'),
    // Permit a database with release scripts this build does not know, for a
    // deliberate rollback to an earlier build.
    allowNewerSchema: booleanSchema(false),
  }),
  lti: z.object({
    redirect_uri: urlSchema,
    jwks: z.object({
      kid: z.string(),
      privateKey: base64Schema.transform((val) => val.toString('utf-8')),
      publicKey: base64Schema.transform((val) => val.toString('utf-8')),
    }),
    score_submission: z.object({
      // How long to wait after finding no pending submissions before polling again.
      idle_interval_ms: z.coerce.number().default(5_000),
      // Minimum seconds since last progress update before a submission is eligible to be sent
      throttle_seconds: z.coerce.number().default(10),
      // How long before fetch requests to the LTI platform timeout
      request_timeout_seconds: z.coerce.number().default(60),
      // How long before a lineitem lease expires, and can be claimed by another worker
      lease_duration_seconds: z.coerce.number().default(120),
      // Maximum number of concurrent in-flight submissions per platform
      max_concurrent_submissions: z.coerce.number().default(20),
      // Rate-limit governor: requests-worth of quota headroom to keep in reserve
      quota_reserve_requests: z.coerce.number().default(4),
      // Rate-limit governor: window (ms) over which quota readings are aggregated
      quota_window_ms: z.coerce.number().default(10_000),
      // Rate-limit governor: minimum interval (ms) between +1 concurrency ramp-ups
      quota_ramp_interval_ms: z.coerce.number().default(10_000),
      // Base seconds for calculating backoff after a failed submission attempt
      backoff_base_seconds: z.coerce.number().default(5),
      // Backoff doubles until this many consecutive errors
      backoff_error_cap: z.coerce.number().default(5),
      // Incident detection: consecutive non-clean failures that trip the breaker / open an incident
      incident_trip_threshold: z.coerce.number().default(5),
      // Incident recovery: failure-free seconds required before an incident may resolve
      recovery_quiet_window_seconds: z.coerce.number().default(3_600),
      // Incident recovery: clean round-trips required before an incident may resolve
      recovery_min_successes: z.coerce.number().default(50),
      // Incident recovery: breaker-closed seconds after which an incident resolves regardless
      recovery_hard_cap_seconds: z.coerce.number().default(86_400),
      // Notifier: active span (seconds) before a high-severity incident pages an admin
      notify_persist_threshold_seconds: z.coerce.number().default(1800),
      // Notifier: sweep cadence in seconds (keep below the persist threshold)
      notify_poll_interval_seconds: z.coerce.number().default(300),
      // Manager: cadence (seconds) for reconciling running processors against the
      // platforms table, so newly-registered platforms start without a redeploy
      platform_reconcile_interval_seconds: z.coerce.number().default(60),
    }),
  }),
  // Optional so that an instance which never serves learner sign-in (for
  // example DEPLOYMENT_MODE=admin) can start without OAuth credentials. When
  // any OAuth variable is supplied the whole section is validated; the sign-in
  // services fail with a configuration error if invoked while it is absent.
  oauth: z.preprocess(
    (value) => (hasAnyDefinedLeaf(value) ? value : undefined),
    z
      .object({
        google: z.object({
          client_id: z.string(),
          client_secret: z.string(),
          auth_url: z.string(),
          access_token_url: z.string(),
          return_url: z.string(),
        }),
        github: z.object({
          user_url: z.string(),
        }),
      })
      .optional()
  ),
  recaptcha: z.object({
    secret_key: z.string().optional(),
    mandatory: booleanSchema(false),
  }),
  email: z.object({
    defaultFromAddress: z.string(),
    templateDirectory: z.string().default('email-templates'),
    debugOnly: booleanSchema(false),
    transport: z.object({
      host: z.string(),
      port: z.coerce.number(),
      secure: booleanSchema(true),
      auth: z.object({
        user: z.string().optional(),
        pass: z.string().optional(),
      }),
    }),
  }),
})

export type Config = z.infer<typeof configSchema>
