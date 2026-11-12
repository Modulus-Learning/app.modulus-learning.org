import assert from 'node:assert/strict'

import { describe, it } from 'vitest'

import { canvasRegistrationEndpoints } from './registration.js'

const hosted = [
  ['https://canvas.instructure.com', 'https://sso.canvaslms.com'],
  ['https://canvas.beta.instructure.com', 'https://sso.beta.canvaslms.com'],
  ['https://canvas.test.instructure.com', 'https://sso.test.canvaslms.com'],
] as const

describe('canvasRegistrationEndpoints', () => {
  for (const [issuer, sso] of hosted) {
    for (const input of [issuer, `${issuer}/`]) {
      it(`maps ${input} to its sso authorization host`, () => {
        assert.deepEqual(canvasRegistrationEndpoints(input), {
          authorization_endpoint: `${sso}/api/lti/authorize_redirect`,
          authorization_server: `${issuer}/login/oauth2/token`,
          token_endpoint: `${issuer}/login/oauth2/token`,
          jwks_uri: `${issuer}/api/lti/security/jwks`,
        })
      })
    }
  }

  it('keeps every endpoint issuer-relative for self-hosted Canvas', () => {
    const issuer = 'https://canvas.example.edu'
    assert.deepEqual(canvasRegistrationEndpoints(issuer), {
      authorization_endpoint: `${issuer}/api/lti/authorize_redirect`,
      authorization_server: `${issuer}/login/oauth2/token`,
      token_endpoint: `${issuer}/login/oauth2/token`,
      jwks_uri: `${issuer}/api/lti/security/jwks`,
    })
  })
})
