/**
 * The environment each deployment mode is permitted to need, as synthetic,
 * non-secret values. This is the single statement of "what does a frontend /
 * admin / all-in-one instance require": the boot test parses host config and
 * initialises core with exactly these sets, and `.env.example` and the Fly
 * tomls are kept in step with it.
 */

import { generateKeyPairSync } from 'node:crypto'

// Throwaway RS256 keypairs generated per test run: core imports these at init,
// so they must be real PEM key material, but they are never persisted.
const rsaPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return {
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64'),
  }
}

const JWT = rsaPair()
const JWKS = rsaPair()

const cookie = (prefix: string, name: string, sameSite: 'lax' | 'none') => ({
  [`${prefix}_NAME`]: name,
  [`${prefix}_SAME_SITE`]: sameSite,
  [`${prefix}_HTTP_ONLY`]: 'true',
  [`${prefix}_SECURE`]: 'true',
})

/** Required by every mode: host settings shared by both surfaces, plus core. */
export const COMMON_ENV: Record<string, string> = {
  PORT: '3000',
  NEXT_PUBLIC_SITE_NAME: 'Modulus',
  NEXT_PUBLIC_SITE_DESCRIPTION: 'Modulus test instance',
  NEXT_PUBLIC_PUBLIC_SERVER_URL: 'https://modulus.test',
  NEXT_PUBLIC_CSP_ENABLED: 'false',
  DATA_REQUEST_CACHING: 'true',
  ANALYTICS_ENABLED: 'false',
  SESSION_SECRET: 'test-session-secret',
  ...cookie('FLASH_COOKIE', 'flash', 'lax'),
  LOG_PRETTY: 'false',
  SYSTEM_EMAIL_FROM_ADDRESS: 'Modulus <noreply@modulus.test>',
  CONTACT_SUBMISSION_FROM_ADDRESS: 'Modulus <noreply@modulus.test>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  S3_BUCKET: 'test',
  S3_CDN_DOMAIN: 'https://cdn.modulus.test',
  // core
  SERVER_HOST: 'modulus.test',
  SERVER_BASE_URL: 'https://modulus.test',
  API_JWT_PRIVATE_KEY: JWT.privateKey,
  API_JWT_PUBLIC_KEY: JWT.publicKey,
  API_JWT_AUDIENCE: 'https://modulus.test',
  API_JWT_ISSUER: 'https://modulus.test',
  API_JWT_ACCESS_TOKEN_EXPIRES_IN: '600',
  API_JWT_REFRESH_TOKEN_EXPIRES_IN: '2592000',
  POSTGRES_CONNECTION_STRING: 'postgres://modulus:modulus@127.0.0.1:5432/modulus_test',
  LTI_REDIRECT_URI: 'https://modulus.test/routes/lti/launch',
  LTI_JWKS_KEY_ID: 'kid',
  LTI_JWKS_PRIVATE_KEY: JWKS.privateKey,
  LTI_JWKS_PUBLIC_KEY: JWKS.publicKey,
}

/** Required only where the learner/LTI surface is served. */
export const FRONTEND_ENV: Record<string, string> = {
  ...cookie('USER_SESSION_COOKIE', 'user_session', 'none'),
  ...cookie('USER_REFRESH_COOKIE', 'user_refresh', 'none'),
  API_BASE_URL: 'https://modulus.test/routes',
  API_JWT_PUBLIC_KEY: JWT.publicKey,
  API_JWT_ISSUER: 'https://modulus.test',
  API_JWT_AUDIENCE: 'https://modulus.test',
  NEXT_PUBLIC_RECAPTCHA_ENABLED: 'false',
  NEXT_PUBLIC_RECAPTCHA_MANDATORY: 'false',
  OAUTH_GITHUB_CLIENT_ID: 'github-client',
  OAUTH_GITHUB_CLIENT_SECRET: 'github-secret',
  OAUTH_GITHUB_AUTH_URL: 'https://github.test/login/oauth/authorize',
  OAUTH_GITHUB_ACCESS_TOKEN_URL: 'https://github.test/login/oauth/access_token',
  OAUTH_GITHUB_USER_URL: 'https://api.github.test/user',
  OAUTH_GITHUB_RETURN_URL: 'https://modulus.test/routes/oauth/github',
  OAUTH_GOOGLE_CLIENT_ID: 'google-client',
  OAUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
  OAUTH_GOOGLE_AUTH_URL: 'https://accounts.google.test/o/oauth2/auth',
  OAUTH_GOOGLE_ACCESS_TOKEN_URL: 'https://oauth2.google.test/token',
  OAUTH_GOOGLE_RETURN_URL: 'https://modulus.test/routes/oauth/google',
}

/** Required only where the admin surface is served. */
export const ADMIN_ENV: Record<string, string> = {
  ...cookie('ADMIN_SESSION_COOKIE', 'admin_session', 'lax'),
  ...cookie('ADMIN_REFRESH_COOKIE', 'admin_refresh', 'lax'),
}

export type Mode = 'all-in-one' | 'frontend' | 'admin'

/** The complete permitted environment for one mode. */
export const envForMode = (mode: Mode): Record<string, string> => {
  const base = { ...COMMON_ENV, DEPLOYMENT_MODE: mode }
  switch (mode) {
    case 'frontend':
      return { ...base, ...FRONTEND_ENV, JOB_QUEUE_ENABLED: 'false' }
    case 'admin':
      return { ...base, ...ADMIN_ENV, JOB_QUEUE_ENABLED: 'true' }
    case 'all-in-one':
      return { ...base, ...FRONTEND_ENV, ...ADMIN_ENV, JOB_QUEUE_ENABLED: 'true' }
  }
}
