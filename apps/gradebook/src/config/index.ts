import { base64Schema, booleanSchema, requireIfEnabled, urlSchema } from '@infonomic/schemas'
import { z } from 'zod'

/**
 * Server configuration schema and functions. These values are ONLY available
 * on the server and are read from `process.env` at runtime. Secrets live in
 * `.env.local`, which is NOT committed; the committed `.env` holds only public,
 * commit-safe values (the `VITE_*` keys).
 */
const cookieSchema = z.object({
  name: z.string(),
  sameSite: z.enum(['strict', 'lax', 'none']),
  httpOnly: booleanSchema(),
  secure: booleanSchema(),
})

const deploymentModeSchema = z.enum(['all-in-one', 'frontend', 'admin']).default('all-in-one')

type Mode = z.infer<typeof deploymentModeSchema>

/**
 * Settings only the learner/LTI (frontend) surface reads. An `admin` instance
 * neither validates nor exposes them.
 */
const frontendSections = {
  userSession: cookieSchema,
  userRefresh: cookieSchema,
  api: z.object({
    baseUrl: urlSchema,
    jwt: z.object({
      publicKey: base64Schema.transform((val) => val.toString('utf-8')),
      issuer: z.string(),
      audience: z.string(),
    }),
  }),
  recaptcha: z
    .object({
      enabled: booleanSchema(),
      mandatory: booleanSchema(),
      siteKey: z.string().optional(), // Initially optional
      projectID: z.string().optional(), // Initially optional
      secretKey: z.string().optional(), // Initially optional
    })
    .superRefine(requireIfEnabled(['siteKey', 'secretKey'], 'enabled')),
  oauth: z.object({
    github: z.object({
      client_id: z.string(),
      client_secret: z.string(),
      auth_url: z.string(),
      access_token_url: z.string(),
      user_url: z.string(),
      return_url: z.string(),
    }),
    google: z.object({
      client_id: z.string(),
      client_secret: z.string(),
      auth_url: z.string(),
      access_token_url: z.string(),
      return_url: z.string(),
    }),
  }),
  lti: z.object({
    /**
     * Whether a verified LTI resource-link launch shows the interstitial
     * before redirecting to the activity.
     *
     * - `never`  — redirect straight to the activity (default).
     * - `always` — show the interstitial.
     *
     * An enum rather than a boolean so that a future `first-launch` mode can
     * be added without a breaking configuration change.
     */
    launchInterstitial: z.enum(['never', 'always']).default('never'),
  }),
}

/**
 * Settings only the admin surface reads. A `frontend` instance neither
 * validates nor exposes them.
 */
const adminSections = {
  adminSession: cookieSchema,
  adminRefresh: cookieSchema,
}

type SectionName = keyof typeof frontendSections | keyof typeof adminSections

const surfaceOf = (section: SectionName): 'frontend' | 'admin' =>
  section in frontendSections ? 'frontend' : 'admin'

/**
 * Stand-in for a section the current deployment mode does not serve. Any
 * property read throws, so code that reaches the other surface's settings
 * fails loudly instead of running with missing configuration.
 */
const unservedSection = (path: string, mode: Mode): unknown =>
  new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
          return undefined
        }
        throw new Error(
          `${path}.${property} is not configured: DEPLOYMENT_MODE=${mode} does not serve the ${surfaceOf(path.split('.').pop() as SectionName)} surface.`
        )
      },
    }
  )

// The unserved branch is typed as the section's own schema so that every mode
// yields the same `ServerConfig` type: consumers on the served surface need no
// narrowing, and the stand-in throws if the other surface touches it.
const section = <T extends z.ZodTypeAny>(
  name: SectionName,
  path: string,
  schema: T,
  mode: Mode
): T =>
  mode === 'all-in-one' || surfaceOf(name) === mode
    ? schema
    : (z.unknown().transform(() => unservedSection(path, mode)) as unknown as T)

/**
 * Builds the server schema for one deployment mode. Settings common to every
 * mode are always required. Each surface's own settings are required only when
 * the mode serves that surface; otherwise they are not validated and are
 * replaced by a stand-in that throws on access (see `unservedSection`).
 */
const buildServerSchema = (mode: Mode) =>
  z
    .object({
      port: z.coerce.number().int(),
      siteName: z.string(),
      siteDescription: z.string(),
      publicServerUrl: urlSchema,
      cspEnabled: booleanSchema(),
      dataRequestCaching: booleanSchema(),
      analyticsEnabled: booleanSchema(),
      sessionSecret: z.string(),
      cookies: z.object({
        adminSession: section(
          'adminSession',
          'cookies.adminSession',
          adminSections.adminSession,
          mode
        ),
        adminRefresh: section(
          'adminRefresh',
          'cookies.adminRefresh',
          adminSections.adminRefresh,
          mode
        ),
        userSession: section(
          'userSession',
          'cookies.userSession',
          frontendSections.userSession,
          mode
        ),
        userRefresh: section(
          'userRefresh',
          'cookies.userRefresh',
          frontendSections.userRefresh,
          mode
        ),
        flash: cookieSchema,
      }),
      api: section('api', 'api', frontendSections.api, mode),
      recaptcha: section('recaptcha', 'recaptcha', frontendSections.recaptcha, mode),
      log: z.object({
        level: z.string().optional(),
        pretty: booleanSchema(),
      }),
      email: z.object({
        systemEmailFromAddress: z.string(),
        contactSubmissionFromAddress: z.string(),
        templateDirectory: z.string().optional(),
        transport: z.object({
          host: z.string(),
          port: z.coerce.number().int(),
          secure: booleanSchema(),
          auth: z.object({
            user: z.string().optional(),
            pass: z.string().optional(),
          }),
        }),
      }),
      jobQueue: z.object({
        enabled: booleanSchema(true),
        /**
         * Hard deadline for the shutdown drain (`SHUTDOWN_DRAIN_SECONDS`): how
         * long a stopping instance waits for its job workers and in-flight
         * requests before exiting. See `@/lib/shutdown`.
         */
        shutdownDrainSeconds: z.coerce.number().int().positive().default(70),
        /**
         * Mirrors core's `LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS` (same
         * default), read here only for the boot check against the drain deadline.
         */
        scoreSubmissionRequestTimeoutSeconds: z.coerce.number().int().positive().default(60),
      }),
      /**
       * Selects which surfaces of the application this instance serves. See
       * `@/lib/deployment-mode` for how the mode gates routes.
       *
       * - `all-in-one` — frontend, admin, and (per JOB_QUEUE_ENABLED) background
       *   jobs all run in a single process. Every section is required.
       * - `frontend` — only the public/learner + LTI surface; admin settings are
       *   not required, and background jobs are forbidden (see the superRefine
       *   below).
       * - `admin` — only the admin surface; learner cookie, API, reCAPTCHA,
       *   OAuth and LTI settings are not required. Background jobs run (per
       *   JOB_QUEUE_ENABLED).
       */
      deployment: z.object({
        mode: deploymentModeSchema,
      }),
      lti: section('lti', 'lti', frontendSections.lti, mode),
      s3: z.object({
        accessKey: z.string(),
        secretKey: z.string(),
        bucket: z.string(),
        cdnDomain: z.string(),
      }),
      oauth: section('oauth', 'oauth', frontendSections.oauth, mode),
    })
    .superRefine((config, ctx) => {
      // A frontend-only instance must never run background jobs (e.g. the LTI
      // score-submission worker). Fail fast at boot rather than silently starting
      // them or silently ignoring an operator's JOB_QUEUE_ENABLED=true.
      if (config.deployment.mode === 'frontend' && config.jobQueue.enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jobQueue', 'enabled'],
          message:
            "DEPLOYMENT_MODE=frontend requires JOB_QUEUE_ENABLED=false (background jobs are only run by 'admin' or 'all-in-one' instances).",
        })
      }
    })

/** The full shape, as validated in `all-in-one` mode. */
const serverSchema = buildServerSchema('all-in-one')

type ServerConfig = z.infer<typeof serverSchema>

type ServerEnv = Record<string, string | undefined>

/**
 * Parse server configuration from an environment for the deployment mode it
 * names. Exported for tests; application code uses `getServerConfig()`.
 */
export const parseServerConfig = (env: ServerEnv = process.env): ServerConfig => {
  // Resolve the mode first: it decides which sections the schema requires.
  const mode = deploymentModeSchema.parse(env.DEPLOYMENT_MODE)
  return buildServerSchema(mode).parse(readServerEnv(env)) as ServerConfig
}

const readServerEnv = (env: ServerEnv) => ({
  port: env.PORT,
  siteName: env.VITE_SITE_NAME,
  siteDescription: env.VITE_SITE_DESCRIPTION,
  publicServerUrl: env.VITE_PUBLIC_SERVER_URL,
  cspEnabled: env.VITE_CSP_ENABLED,
  dataRequestCaching: env.DATA_REQUEST_CACHING,
  analyticsEnabled: env.ANALYTICS_ENABLED,
  sessionSecret: env.SESSION_SECRET,
  cookies: {
    adminSession: {
      name: env.ADMIN_SESSION_COOKIE_NAME,
      sameSite: env.ADMIN_SESSION_COOKIE_SAME_SITE,
      httpOnly: env.ADMIN_SESSION_COOKIE_HTTP_ONLY,
      secure: env.ADMIN_SESSION_COOKIE_SECURE,
    },
    adminRefresh: {
      name: env.ADMIN_REFRESH_COOKIE_NAME,
      sameSite: env.ADMIN_REFRESH_COOKIE_SAME_SITE,
      httpOnly: env.ADMIN_REFRESH_COOKIE_HTTP_ONLY,
      secure: env.ADMIN_REFRESH_COOKIE_SECURE,
    },
    userSession: {
      name: env.USER_SESSION_COOKIE_NAME,
      sameSite: env.USER_SESSION_COOKIE_SAME_SITE,
      httpOnly: env.USER_SESSION_COOKIE_HTTP_ONLY,
      secure: env.USER_SESSION_COOKIE_SECURE,
    },
    userRefresh: {
      name: env.USER_REFRESH_COOKIE_NAME,
      sameSite: env.USER_REFRESH_COOKIE_SAME_SITE,
      httpOnly: env.USER_REFRESH_COOKIE_HTTP_ONLY,
      secure: env.USER_REFRESH_COOKIE_SECURE,
    },
    flash: {
      name: env.FLASH_COOKIE_NAME,
      sameSite: env.FLASH_COOKIE_SAME_SITE,
      httpOnly: env.FLASH_COOKIE_HTTP_ONLY,
      secure: env.FLASH_COOKIE_SECURE,
    },
  },
  api: {
    baseUrl: env.API_BASE_URL,
    jwt: {
      publicKey: env.API_JWT_PUBLIC_KEY,
      issuer: env.API_JWT_ISSUER,
      audience: env.API_JWT_AUDIENCE,
    },
  },
  recaptcha: {
    enabled: env.VITE_RECAPTCHA_ENABLED,
    mandatory: env.VITE_RECAPTCHA_MANDATORY,
    siteKey: env.VITE_RECAPTCHA_SITE_KEY,
    secretKey: env.RECAPTCHA_SECRET_KEY,
    projectID: env.GOOGLE_APPLICATION_PROJECT_ID,
  },
  log: {
    level: env.LOG_LEVEL ?? 'info',
    pretty: env.LOG_PRETTY,
  },
  email: {
    templateDirectory: 'email-templates',
    systemEmailFromAddress: env.SYSTEM_EMAIL_FROM_ADDRESS,
    contactSubmissionFromAddress: env.CONTACT_SUBMISSION_FROM_ADDRESS,
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
  jobQueue: {
    enabled: env.JOB_QUEUE_ENABLED,
    shutdownDrainSeconds: env.SHUTDOWN_DRAIN_SECONDS,
    scoreSubmissionRequestTimeoutSeconds: env.LTI_SCORE_SUBMISSION_REQUEST_TIMEOUT_SECONDS,
  },
  s3: {
    accessKey: env.S3_ACCESS_KEY_ID,
    secretKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    cdnDomain: env.S3_CDN_DOMAIN,
  },
  oauth: {
    github: {
      client_id: env.OAUTH_GITHUB_CLIENT_ID,
      client_secret: env.OAUTH_GITHUB_CLIENT_SECRET,
      auth_url: env.OAUTH_GITHUB_AUTH_URL,
      access_token_url: env.OAUTH_GITHUB_ACCESS_TOKEN_URL,
      user_url: env.OAUTH_GITHUB_USER_URL,
      return_url: env.OAUTH_GITHUB_RETURN_URL,
    },
    google: {
      client_id: env.OAUTH_GOOGLE_CLIENT_ID,
      client_secret: env.OAUTH_GOOGLE_CLIENT_SECRET,
      auth_url: env.OAUTH_GOOGLE_AUTH_URL,
      access_token_url: env.OAUTH_GOOGLE_ACCESS_TOKEN_URL,
      return_url: env.OAUTH_GOOGLE_RETURN_URL,
    },
  },
  deployment: {
    mode: env.DEPLOYMENT_MODE,
  },
  lti: {
    launchInterstitial: env.LTI_LAUNCH_INTERSTITIAL,
  },
})

let cachedServerConfig: ServerConfig

export const getServerConfig = (): ServerConfig => {
  if (cachedServerConfig == null) {
    cachedServerConfig = parseServerConfig()
  }
  return cachedServerConfig
}

/**
 * Public configuration schema and functions. These values come from the
 * `VITE_*` keys in the committed `.env`, are compiled into the client bundle
 * (Vite inlines `import.meta.env.VITE_*`; the Next app forwards them through
 * the `env` option in `next.config.ts`) and are therefore shipped to the
 * browser. They must never contain secrets.
 */
const publicSchema = z.object({
  siteName: z.string(),
  siteDescription: z.string(),
  publicServerUrl: urlSchema,
  cspEnabled: booleanSchema(),
  recaptcha: z
    .object({
      enabled: booleanSchema(),
      mandatory: booleanSchema(),
      siteKey: z.string().optional(),
    })
    .superRefine(requireIfEnabled(['siteKey'], 'enabled')),
})

export type PublicConfig = z.infer<typeof publicSchema>

const initPublicConfig = () =>
  publicSchema.parse({
    siteName: process.env.VITE_SITE_NAME,
    siteDescription: process.env.VITE_SITE_DESCRIPTION,
    publicServerUrl: process.env.VITE_PUBLIC_SERVER_URL,
    cspEnabled: process.env.VITE_CSP_ENABLED,
    recaptcha: {
      enabled: process.env.VITE_RECAPTCHA_ENABLED,
      mandatory: process.env.VITE_RECAPTCHA_MANDATORY,
      siteKey: process.env.VITE_RECAPTCHA_SITE_KEY,
    },
  })

let cachedPublicConfig: PublicConfig

export const getPublicConfig = (): PublicConfig => {
  if (cachedPublicConfig == null) {
    cachedPublicConfig = initPublicConfig()
  }
  return cachedPublicConfig
}

/**
 * Returns a strict Content-Security-Policy header value for dynamic, non-cacheable pages.
 * It uses a nonce and 'strict-dynamic' to provide the highest level of security against XSS.
 * @param nonce A cryptographic nonce for the current request.
 */
export function getCSPHeaderStrict(nonce: string) {
  const cspHeader = `
    default-src 'self';
    connect-src 'self' app.modulus-learning.org *.google.com *.gstatic.com *.recaptcha.net;
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    script-src-elem 'self' 'nonce-${nonce}' *.recaptcha.net;
    style-src 'self' 'unsafe-inline';
    frame-src 'self' *.google.com *.recaptcha.net www.youtube-nocookie.com *.vimeo.com;
    img-src 'self' blob: data: cdn.modulus-learning.org *.picsum.photos picsum.photos;
    media-src 'self' blob: data: cdn.modulus.org;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
  return cspHeader.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Returns a more relaxed Content-Security-Policy header value for static, cacheable pages (e.g., from a CMS).
 * It uses 'unsafe-inline' to allow Next.js's inline scripts, which is necessary for caching the HTML.
 * While less secure than the strict policy, it still restricts external script sources to a whitelist.
 */
export function getCSPHeaderRelaxed() {
  const cspHeader = `
    default-src 'self';
    connect-src 'self' app.modulus-learning.org *.google.com *.gstatic.com *.recaptcha.net;
    script-src 'self' 'unsafe-inline' *.google.com *.gstatic.com *.recaptcha.net www.youtube-nocookie.com *.vimeo.com;
    style-src 'self' 'unsafe-inline';
    frame-src 'self' *.google.com *.recaptcha.net www.youtube-nocookie.com *.vimeo.com;
    img-src 'self' blob: data: cdn.modulus-learning.org *.picsum.photos picsum.photos;
    media-src 'self' blob: data: cdn.modulus-learning.org;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
  return cspHeader.replace(/\s{2,}/g, ' ').trim()
}

export function getCSPHeader(nonce: string | null) {
  const cspHeader = `
    default-src 'self';
    connect-src 'self' app.modulus-learning.org *.google.com *.gstatic.com *.recaptcha.net;
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    script-src-elem 'self' 'nonce-${nonce}' *.recaptcha.net;
    style-src 'self' 'unsafe-inline';
    frame-src 'self' *.google.com *.recaptcha.net www.youtube-nocookie.com *.vimeo.com;
    img-src 'self' blob: data: cdn.modulus-learning.org *.picsum.photos picsum.photos;
    media-src 'self' blob: data: cdn.modulus-learning.org;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
    `

  // Replace newline characters and spaces
  return cspHeader.replace(/\s{2,}/g, ' ').trim()
}
