import { type Config, configSchema } from '@/config.js'
import { type JWTVerifierConfig, jwtVerifierConfigSchema } from '@/public/tokens.js'

/**
 * The documented mapping from environment variables to core configuration.
 * Each loader takes the environment as an argument and never reads
 * `process.env` itself, so a host decides where configuration comes from.
 */

export type Env = Record<string, string | undefined>

/** Map environment variables onto the core configuration shape, unvalidated. */
export const readCoreEnv = (env: Env) => {
  return {
    server: {
      host: env.SERVER_HOST,
      baseUrl: env.SERVER_BASE_URL,
    },
    jwt: {
      publicKey: env.API_JWT_PUBLIC_KEY,
      privateKey: env.API_JWT_PRIVATE_KEY,
      audience: env.API_JWT_AUDIENCE,
      issuer: env.API_JWT_ISSUER,
      expires: {
        access: env.API_JWT_ACCESS_TOKEN_EXPIRES_IN,
        refresh: env.API_JWT_REFRESH_TOKEN_EXPIRES_IN,
        agent: env.AGENT_JWT_EXPIRES_IN ?? env.API_JWT_REFRESH_TOKEN_EXPIRES_IN,
      },
      agent: {
        renewAfterSeconds: env.AGENT_JWT_RENEW_AFTER_SECONDS,
      },
    },
    jobs: {
      housekeepingIntervalSeconds: env.HOUSEKEEPING_INTERVAL_SECONDS,
    },
    postgres: {
      connectionString: env.POSTGRES_CONNECTION_STRING,
    },
    lti: {
      redirect_uri: env.LTI_REDIRECT_URI,
      jwks: {
        kid: env.LTI_JWKS_KEY_ID,
        privateKey: env.LTI_JWKS_PRIVATE_KEY,
        publicKey: env.LTI_JWKS_PUBLIC_KEY,
      },
      score_submission: {
        idle_interval_ms: env.LTI_SCORE_SUBMISSION_IDLE_INTERVAL_MS,
        throttle_seconds: env.LTI_SCORE_SUBMISSION_THROTTLE_SECONDS,
        request_timeout_seconds: env.LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS,
        lease_duration_seconds: env.LTI_SCORE_SUBMISSION_LEASE_DURATION_SECONDS,
        max_concurrent_submissions: env.LTI_SCORE_SUBMISSION_MAX_CONCURRENT_SUBMISSIONS,
        quota_reserve_requests: env.LTI_SCORE_SUBMISSION_QUOTA_RESERVE_REQUESTS,
        quota_window_ms: env.LTI_SCORE_SUBMISSION_QUOTA_WINDOW_MS,
        quota_ramp_interval_ms: env.LTI_SCORE_SUBMISSION_QUOTA_RAMP_INTERVAL_MS,
        backoff_base_seconds: env.LTI_SCORE_SUBMISSION_BACKOFF_BASE_SECONDS,
        backoff_error_cap: env.LTI_SCORE_SUBMISSION_BACKOFF_ERROR_CAP,
        incident_trip_threshold: env.LTI_SCORE_SUBMISSION_INCIDENT_TRIP_THRESHOLD,
        recovery_quiet_window_seconds: env.LTI_SCORE_SUBMISSION_RECOVERY_QUIET_WINDOW_SECONDS,
        recovery_min_successes: env.LTI_SCORE_SUBMISSION_RECOVERY_MIN_SUCCESSES,
        recovery_hard_cap_seconds: env.LTI_SCORE_SUBMISSION_RECOVERY_HARD_CAP_SECONDS,
        notify_persist_threshold_seconds: env.LTI_SCORE_SUBMISSION_NOTIFY_PERSIST_THRESHOLD_SECONDS,
        notify_poll_interval_seconds: env.LTI_SCORE_SUBMISSION_NOTIFY_POLL_INTERVAL_SECONDS,
        platform_reconcile_interval_seconds:
          env.LTI_SCORE_SUBMISSION_PLATFORM_RECONCILE_INTERVAL_SECONDS,
      },
    },
    oauth: {
      google: {
        client_id: env.OAUTH_GOOGLE_CLIENT_ID,
        client_secret: env.OAUTH_GOOGLE_CLIENT_SECRET,
        auth_url: env.OAUTH_GOOGLE_AUTH_URL,
        access_token_url: env.OAUTH_GOOGLE_ACCESS_TOKEN_URL,
        return_url: env.OAUTH_GOOGLE_RETURN_URL,
      },
      github: {
        user_url: env.OAUTH_GITHUB_USER_URL,
      },
    },
    recaptcha: {
      secret_key: env.RECAPTCHA_SECRET_KEY,
      mandatory: env.RECAPTCHA_MANDATORY,
    },
    email: {
      defaultFromAddress: env.SYSTEM_EMAIL_FROM_ADDRESS,
      templateDirectory: env.EMAIL_TEMPLATE_DIRECTORY,
      debugOnly: env.EMAIL_DEBUG_ONLY,
      transport: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        },
      },
    },
  }
}

/** Map and validate the core configuration from an environment. */
export const loadCoreConfigFromEnv = (env: Env): Config => configSchema.parse(readCoreEnv(env))

/** Map and validate the token-verifier configuration from an environment. */
export const loadTokenVerifierConfigFromEnv = (env: Env): JWTVerifierConfig =>
  jwtVerifierConfigSchema.parse({
    publicKey: env.API_JWT_PUBLIC_KEY,
    audience: env.API_JWT_AUDIENCE,
    issuer: env.API_JWT_ISSUER,
  })
