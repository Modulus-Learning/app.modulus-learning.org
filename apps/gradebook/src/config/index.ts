import { base64Schema, booleanSchema, requireIfEnabled, urlSchema } from '@infonomic/schemas'
import { z } from 'zod'

/**
 * Server configuration schema and functions. Note that these
 * values are ONLY available on the server and NOT available
 * at build time and therefore not available to the browser.
 * Values here are populated via the projects's .env file
 * which is NOT committed to the project's Git repo and
 * CAN include secrets.
 */
const serverSchema = z.object({
  port: z.coerce.number().int(),
  siteName: z.string(),
  siteDescription: z.string(),
  publicServerUrl: urlSchema,
  cspEnabled: booleanSchema(),
  dataRequestCaching: booleanSchema(),
  analyticsEnabled: booleanSchema(),
  sessionSecret: z.string(),
  cookies: z.object({
    adminSession: z.object({
      name: z.string(),
      sameSite: z.enum(['strict', 'lax', 'none']),
      httpOnly: booleanSchema(),
      secure: booleanSchema(),
    }),
    adminRefresh: z.object({
      name: z.string(),
      sameSite: z.enum(['strict', 'lax', 'none']),
      httpOnly: booleanSchema(),
      secure: booleanSchema(),
    }),
    userSession: z.object({
      name: z.string(),
      sameSite: z.enum(['strict', 'lax', 'none']),
      httpOnly: booleanSchema(),
      secure: booleanSchema(),
    }),
    userRefresh: z.object({
      name: z.string(),
      sameSite: z.enum(['strict', 'lax', 'none']),
      httpOnly: booleanSchema(),
      secure: booleanSchema(),
    }),
    flash: z.object({
      name: z.string(),
      sameSite: z.enum(['strict', 'lax', 'none']),
      httpOnly: booleanSchema(),
      secure: booleanSchema(),
    }),
  }),
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
    enabled: booleanSchema(),
  }),
  s3: z.object({
    accessKey: z.string(),
    secretKey: z.string(),
    bucket: z.string(),
    cdnDomain: z.string(),
  }),
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
})

type ServerConfig = z.infer<typeof serverSchema>

const initServerConfig = (): ServerConfig =>
  serverSchema.parse({
    port: process.env.PORT,
    siteName: process.env.NEXT_PUBLIC_SITE_NAME,
    siteDescription: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
    publicServerUrl: process.env.NEXT_PUBLIC_PUBLIC_SERVER_URL,
    cspEnabled: process.env.NEXT_PUBLIC_CSP_ENABLED,
    dataRequestCaching: process.env.DATA_REQUEST_CACHING,
    analyticsEnabled: process.env.ANALYTICS_ENABLED,
    sessionSecret: process.env.SESSION_SECRET,
    cookies: {
      adminSession: {
        name: process.env.ADMIN_SESSION_COOKIE_NAME,
        sameSite: process.env.ADMIN_SESSION_COOKIE_SAME_SITE,
        httpOnly: process.env.ADMIN_SESSION_COOKIE_HTTP_ONLY,
        secure: process.env.ADMIN_SESSION_COOKIE_SECURE,
      },
      adminRefresh: {
        name: process.env.ADMIN_REFRESH_COOKIE_NAME,
        sameSite: process.env.ADMIN_REFRESH_COOKIE_SAME_SITE,
        httpOnly: process.env.ADMIN_REFRESH_COOKIE_HTTP_ONLY,
        secure: process.env.ADMIN_REFRESH_COOKIE_SECURE,
      },
      userSession: {
        name: process.env.USER_SESSION_COOKIE_NAME,
        sameSite: process.env.USER_SESSION_COOKIE_SAME_SITE,
        httpOnly: process.env.USER_SESSION_COOKIE_HTTP_ONLY,
        secure: process.env.USER_SESSION_COOKIE_SECURE,
      },
      userRefresh: {
        name: process.env.USER_REFRESH_COOKIE_NAME,
        sameSite: process.env.USER_REFRESH_COOKIE_SAME_SITE,
        httpOnly: process.env.USER_REFRESH_COOKIE_HTTP_ONLY,
        secure: process.env.USER_REFRESH_COOKIE_SECURE,
      },
      flash: {
        name: process.env.FLASH_COOKIE_NAME,
        sameSite: process.env.FLASH_COOKIE_SAME_SITE,
        httpOnly: process.env.FLASH_COOKIE_HTTP_ONLY,
        secure: process.env.FLASH_COOKIE_SECURE,
      },
    },
    api: {
      baseUrl: process.env.API_BASE_URL,
      jwt: {
        publicKey: process.env.API_JWT_PUBLIC_KEY,
        issuer: process.env.API_JWT_ISSUER,
        audience: process.env.API_JWT_AUDIENCE,
      },
    },
    recaptcha: {
      enabled: process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED,
      mandatory: process.env.NEXT_PUBLIC_RECAPTCHA_MANDATORY,
      siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
      secretKey: process.env.RECAPTCHA_SECRET_KEY,
      projectID: process.env.GOOGLE_APPLICATION_PROJECT_ID,
    },
    log: {
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.LOG_PRETTY,
    },
    email: {
      templateDirectory: 'email-templates',
      systemEmailFromAddress: process.env.SYSTEM_EMAIL_FROM_ADDRESS,
      contactSubmissionFromAddress: process.env.CONTACT_SUBMISSION_FROM_ADDRESS,
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
    jobQueue: {
      enabled: process.env.JOB_QUEUE_ENABLED,
    },
    s3: {
      accessKey: process.env.S3_ACCESS_KEY_ID,
      secretKey: process.env.S3_SECRET_ACCESS_KEY,
      bucket: process.env.S3_BUCKET,
      cdnDomain: process.env.S3_CDN_DOMAIN,
    },
    oauth: {
      github: {
        client_id: process.env.OAUTH_GITHUB_CLIENT_ID,
        client_secret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
        auth_url: process.env.OAUTH_GITHUB_AUTH_URL,
        access_token_url: process.env.OAUTH_GITHUB_ACCESS_TOKEN_URL,
        user_url: process.env.OAUTH_GITHUB_USER_URL,
        return_url: process.env.OAUTH_GITHUB_RETURN_URL,
      },
      google: {
        client_id: process.env.OAUTH_GOOGLE_CLIENT_ID,
        client_secret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
        auth_url: process.env.OAUTH_GOOGLE_AUTH_URL,
        access_token_url: process.env.OAUTH_GOOGLE_ACCESS_TOKEN_URL,
        return_url: process.env.OAUTH_GOOGLE_RETURN_URL,
      },
    },
  })

let cachedServerConfig: ServerConfig

export const getServerConfig = (): ServerConfig => {
  if (cachedServerConfig == null) {
    cachedServerConfig = initServerConfig()
  }
  return cachedServerConfig
}

/**
 * Public configuration schema and functions. Note that these
 * values are populated via .env.public and NEXT_PUBLIC_... vars
 * which are available at 'build time', and are compiled into
 * the Next.js client application - and therefore shipped to
 * the browser. .env.public is also committed to the project's
 * Git repo - and so it's essential that these values
 * DO NOT contain secrets.
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
    siteName: process.env.NEXT_PUBLIC_SITE_NAME,
    siteDescription: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
    publicServerUrl: process.env.NEXT_PUBLIC_PUBLIC_SERVER_URL,
    cspEnabled: process.env.NEXT_PUBLIC_CSP_ENABLED,
    recaptcha: {
      enabled: process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED,
      mandatory: process.env.NEXT_PUBLIC_RECAPTCHA_MANDATORY,
      siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
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
