import { base64Schema, booleanSchema, urlSchema } from '@infonomic/schemas'
import { z } from 'zod'

export interface UrlBuilder {
  baseUrl: string
  startActivityUrl: (activityCode: string, activityUrl: string) => string
  ltiLaunchUrl: string
  dashboardUrl: string
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
    }),
  }),
  postgres: z.object({
    connectionString: z.string(),
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
      // How long to wait after an unexpected error before polling again.
      error_interval_ms: z.coerce.number().default(5_000),
      // Minimum seconds since last progress update before a submission is eligible to be sent
      throttle_seconds: z.coerce.number().default(10),
      // How long before fetch requests to the LTI platform timeout
      request_timeout_seconds: z.coerce.number().default(60),
      // How long before a lineitem lease expires, and can be claimed by another worker
      lease_duration_seconds: z.coerce.number().default(120),
      // Maximum number of concurrent in-flight submissions per platform
      max_concurrent_submissions: z.coerce.number().default(4),
      // Rate-limit governor: requests-worth of quota headroom to keep in reserve
      quota_reserve_requests: z.coerce.number().default(2),
      // Rate-limit governor: window (ms) over which quota readings are aggregated
      quota_window_ms: z.coerce.number().default(10_000),
      // Rate-limit governor: minimum interval (ms) between +1 concurrency ramp-ups
      quota_ramp_interval_ms: z.coerce.number().default(10_000),
      // Base seconds for calculating backoff after a failed submission attempt
      backoff_base_seconds: z.coerce.number().default(5),
      // Backoff doubles until this many consecutive errors
      backoff_error_cap: z.coerce.number().default(5),
    }),
  }),
  oauth: z.object({
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
  }),
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

export const loadConfigUnchecked = () => {
  return {
    server: {
      host: process.env.SERVER_HOST,
      baseUrl: process.env.SERVER_BASE_URL,
    },
    jwt: {
      publicKey: process.env.API_JWT_PUBLIC_KEY,
      privateKey: process.env.API_JWT_PRIVATE_KEY,
      audience: process.env.API_JWT_AUDIENCE,
      issuer: process.env.API_JWT_ISSUER,
      expires: {
        access: process.env.API_JWT_ACCESS_TOKEN_EXPIRES_IN,
        refresh: process.env.API_JWT_REFRESH_TOKEN_EXPIRES_IN,
      },
    },
    postgres: {
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
    },
    lti: {
      redirect_uri: process.env.LTI_REDIRECT_URI,
      jwks: {
        kid: process.env.LTI_JWKS_KEY_ID,
        privateKey: process.env.LTI_JWKS_PRIVATE_KEY,
        publicKey: process.env.LTI_JWKS_PUBLIC_KEY,
      },
      score_submission: {
        idle_interval_ms: process.env.LTI_SCORE_SUBMISSION_IDLE_INTERVAL_MS,
        error_interval_ms: process.env.LTI_SCORE_SUBMISSION_ERROR_INTERVAL_MS,
        throttle_seconds: process.env.LTI_SCORE_SUBMISSION_THROTTLE_SECONDS,
        request_timeout_seconds: process.env.LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS,
        lease_duration_seconds: process.env.LTI_SCORE_SUBMISSION_LEASE_DURATION_SECONDS,
        max_concurrent_submissions: process.env.LTI_SCORE_SUBMISSION_MAX_CONCURRENT_SUBMISSIONS,
        quota_reserve_requests: process.env.LTI_SCORE_SUBMISSION_QUOTA_RESERVE_REQUESTS,
        quota_window_ms: process.env.LTI_SCORE_SUBMISSION_QUOTA_WINDOW_MS,
        quota_ramp_interval_ms: process.env.LTI_SCORE_SUBMISSION_QUOTA_RAMP_INTERVAL_MS,
        backoff_base_seconds: process.env.LTI_SCORE_SUBMISSION_BACKOFF_BASE_SECONDS,
        backoff_error_cap: process.env.LTI_SCORE_SUBMISSION_BACKOFF_ERROR_CAP,
      },
    },
    oauth: {
      google: {
        client_id: process.env.OAUTH_GOOGLE_CLIENT_ID,
        client_secret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
        auth_url: process.env.OAUTH_GOOGLE_AUTH_URL,
        access_token_url: process.env.OAUTH_GOOGLE_ACCESS_TOKEN_URL,
        return_url: process.env.OAUTH_GOOGLE_RETURN_URL,
      },
      github: {
        user_url: process.env.OAUTH_GITHUB_USER_URL,
      },
    },
    recaptcha: {
      secret_key: process.env.RECAPTCHA_SECRET_KEY,
      mandatory: process.env.RECAPTCHA_MANDATORY,
    },
    email: {
      defaultFromAddress: process.env.SYSTEM_EMAIL_FROM_ADDRESS,
      templateDirectory: process.env.EMAIL_TEMPLATE_DIRECTORY,
      debugOnly: process.env.EMAIL_DEBUG_ONLY,
      transport: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
    },
  }
}

export const loadConfig = () => {
  return configSchema.parse(loadConfigUnchecked())
}
