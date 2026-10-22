import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { configSchema, loadConfigUnchecked } from '@/config.js'

const KEY = Buffer.from('-----BEGIN KEY-----\nnot-a-real-key\n-----END KEY-----\n').toString(
  'base64'
)

// The variables core requires regardless of deployment mode.
const REQUIRED_ENV: Record<string, string> = {
  SERVER_HOST: 'modulus.test',
  SERVER_BASE_URL: 'https://modulus.test',
  API_JWT_PRIVATE_KEY: KEY,
  API_JWT_PUBLIC_KEY: KEY,
  API_JWT_AUDIENCE: 'https://modulus.test',
  API_JWT_ISSUER: 'https://modulus.test',
  API_JWT_ACCESS_TOKEN_EXPIRES_IN: '600',
  API_JWT_REFRESH_TOKEN_EXPIRES_IN: '2592000',
  POSTGRES_CONNECTION_STRING: 'postgres://modulus:modulus@127.0.0.1:5432/modulus_test',
  LTI_REDIRECT_URI: 'https://modulus.test/routes/lti/launch',
  LTI_JWKS_KEY_ID: 'kid',
  LTI_JWKS_PRIVATE_KEY: KEY,
  LTI_JWKS_PUBLIC_KEY: KEY,
  SYSTEM_EMAIL_FROM_ADDRESS: 'Modulus <noreply@modulus.test>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
}

const OAUTH_ENV: Record<string, string> = {
  OAUTH_GOOGLE_CLIENT_ID: 'google-client',
  OAUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
  OAUTH_GOOGLE_AUTH_URL: 'https://accounts.google.test/o/oauth2/auth',
  OAUTH_GOOGLE_ACCESS_TOKEN_URL: 'https://oauth2.google.test/token',
  OAUTH_GOOGLE_RETURN_URL: 'https://modulus.test/routes/oauth/google',
  OAUTH_GITHUB_USER_URL: 'https://api.github.test/user',
}

const MANAGED_KEYS = [...Object.keys(REQUIRED_ENV), ...Object.keys(OAUTH_ENV)]

describe('core config: oauth section', () => {
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = Object.fromEntries(MANAGED_KEYS.map((key) => [key, process.env[key]]))
    for (const key of MANAGED_KEYS) delete process.env[key]
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const parseWith = (env: Record<string, string>) => {
    Object.assign(process.env, env)
    return configSchema.parse(loadConfigUnchecked())
  }

  it('is optional when no oauth variable is set', () => {
    const config = parseWith(REQUIRED_ENV)
    assert.equal(config.oauth, undefined)
  })

  it('is parsed when every oauth variable is set', () => {
    const config = parseWith({ ...REQUIRED_ENV, ...OAUTH_ENV })
    assert.equal(config.oauth?.google.client_id, 'google-client')
    assert.equal(config.oauth?.github.user_url, 'https://api.github.test/user')
  })

  it('is validated in full when only some oauth variables are set', () => {
    assert.throws(
      () => parseWith({ ...REQUIRED_ENV, OAUTH_GOOGLE_CLIENT_ID: 'google-client' }),
      /oauth/
    )
  })
})
