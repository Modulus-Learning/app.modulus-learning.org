import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ADMIN, adminToken, callFormFn, PLATFORM, request, withDatabase } from './harness'

// Editable LTI registration endpoints, over HTTP against the built server:
// an endpoint changed in the database is used by the next OIDC login, with no
// restart; and the update server function is refused without a session (the
// gate) or without `lti-platforms:edit` (core), leaving the row unchanged.

const admin = { domain: 'admin', userId: ADMIN.id }

type Row = Record<string, string>

const readPlatform = () =>
  withDatabase(
    async (db) =>
      (
        await db.query(
          `SELECT name, issuer, client_id, authorization_endpoint, token_endpoint, jwks_uri, authorization_server
           FROM lti_platforms WHERE id = $1`,
          [PLATFORM.id]
        )
      ).rows[0] as Row
  )

const setAuthorizationEndpoint = (value: string) =>
  withDatabase((db) =>
    db.query('UPDATE lti_platforms SET authorization_endpoint = $1 WHERE id = $2', [
      value,
      PLATFORM.id,
    ])
  )

const login = () =>
  request('/routes/lti/login', {
    method: 'POST',
    body: new URLSearchParams({
      iss: PLATFORM.issuer,
      login_hint: 'session-login-hint',
      target_link_uri: 'https://modulus.test/routes/lti/launch',
      client_id: PLATFORM.clientId,
    }),
  })

describe('an edited authorization endpoint', () => {
  let original: Row

  beforeEach(async () => {
    original = await readPlatform()
  })

  afterEach(async () => {
    // Restore the seed, so the launch suites see the endpoint they expect.
    await setAuthorizationEndpoint(original.authorization_endpoint as string)
  })

  test('is used by the next OIDC login, without a restart', async () => {
    const before = await login()
    expect(before.status).toBe(303)
    const beforeLocation = new URL(before.headers.get('location') as string)
    expect(`${beforeLocation.origin}${beforeLocation.pathname}`).toBe(
      original.authorization_endpoint
    )

    const edited = 'https://sso.platform.session.test/api/lti/authorize_redirect'
    await setAuthorizationEndpoint(edited)

    const after = await login()
    expect(after.status).toBe(303)
    const location = new URL(after.headers.get('location') as string)
    expect(`${location.origin}${location.pathname}`).toBe(edited)
    expect(location.searchParams.get('client_id')).toBe(PLATFORM.clientId)
  })
})

describe('updateLtiPlatformFn', () => {
  const envelope = () => {
    const form = new FormData()
    for (const [name, value] of Object.entries({
      id: PLATFORM.id,
      name: 'Forged Platform',
      client_id: 'forged-client',
      authorization_endpoint: 'https://forged.test/auth',
      token_endpoint: 'https://forged.test/token',
      jwks_uri: 'https://forged.test/jwks',
      authorization_server: 'forged.test',
    })) {
      form.set(name, value)
    }
    form.set('__args', '[null,"__modulus_form__"]')
    return form
  }

  test('with no session → refused by the gate before the handler runs', async () => {
    const before = await readPlatform()

    const response = await callFormFn('updateLtiPlatformFn', envelope(), {
      expectedPrincipal: admin,
    })

    expect(response.status).not.toBe(200)
    expect(await readPlatform()).toEqual(before)
  })

  test('with an admin session lacking lti-platforms:edit → a failed form state, row unchanged', async () => {
    const before = await readPlatform()

    const response = await callFormFn(
      'updateLtiPlatformFn',
      envelope(),
      { expectedPrincipal: admin },
      `admin_session=${await adminToken()}`
    )

    // The form-action convention: core's ERR_FORBIDDEN is a failed form state.
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('failed')
    expect(body).toContain('You do not have permission to edit LTI platforms.')
    expect(body).not.toContain('/admin/lti-platforms/')
    expect(await readPlatform()).toEqual(before)
  })
})
