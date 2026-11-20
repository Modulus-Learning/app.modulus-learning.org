import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateLtiPlatform: vi.fn(),
  suggestLtiPlatformEndpoints: vi.fn(),
  getCoreAdminRequestContext: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreAdminRequestContext: mocks.getCoreAdminRequestContext,
  getCoreCommands: async () => ({
    admin: {
      ltiPlatforms: {
        updateLtiPlatform: mocks.updateLtiPlatform,
        suggestLtiPlatformEndpoints: mocks.suggestLtiPlatformEndpoints,
      },
    },
  }),
}))
vi.mock('@/config', () => ({
  getServerConfig: () => ({
    cookies: { flash: { name: 'flash', httpOnly: true, secure: true, sameSite: 'lax' } },
  }),
}))
vi.mock('@/lib/server-request', () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
  redirect: mocks.redirect,
}))

import { suggestLtiPlatformEndpoints } from './suggest-endpoints.server'
import { updateLtiPlatform } from './update.server'
import type { LtiPlatformFormState } from './@types'

const IDLE: LtiPlatformFormState = { errors: {}, status: 'idle' }
const ADMIN_AUTH = { requestId: 'request', adminAuth: {} }

const ID = '019c2d8e-842a-7715-a323-a7e31427db2d'
const ENDPOINTS = {
  authorization_endpoint: 'https://sso.test.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://sso.test.canvaslms.com/login/oauth2/token',
  jwks_uri: 'https://sso.test.canvaslms.com/api/lti/security/jwks',
  authorization_server: 'https://sso.test.canvaslms.com/login/oauth2/token',
}
const FIELDS = { id: ID, name: 'Canvas Test', client_id: '10000000000001', ...ENDPOINTS }

const makeFormData = (fields: Record<string, string> = FIELDS): FormData => {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.append(name, value)
  return formData
}

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`)
  }
}

describe('updateLtiPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreAdminRequestContext.mockResolvedValue(ADMIN_AUTH)
    // As the real one does, redirect ends the action by throwing.
    mocks.redirect.mockImplementation((url: string) => {
      throw new Redirected(url)
    })
  })

  test('saves the registration, sets the flash cookie and redirects to the details page', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: true, data: { platform: FIELDS } })

    await expect(updateLtiPlatform(IDLE, makeFormData())).rejects.toEqual(
      new Redirected(`/admin/lti-platforms/${ID}`)
    )

    expect(mocks.updateLtiPlatform).toHaveBeenCalledWith(ADMIN_AUTH, FIELDS)
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'flash',
      'LTI Platform Updated::Canvas Test LTI platform updated successfully.',
      expect.objectContaining({ path: '/', maxAge: 0 })
    )
  })

  test('never sends an issuer to core', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: true, data: { platform: FIELDS } })

    await expect(
      updateLtiPlatform(IDLE, makeFormData({ ...FIELDS, issuer: 'https://evil.test' }))
    ).rejects.toBeInstanceOf(Redirected)

    expect(mocks.updateLtiPlatform.mock.calls[0]?.[1]).not.toHaveProperty('issuer')
  })

  test('maps ERR_FORBIDDEN to a permission message', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: false, error: { code: 'ERR_FORBIDDEN' } })

    const state = await updateLtiPlatform(IDLE, makeFormData())

    expect(state).toEqual({
      errors: {},
      message: 'You do not have permission to edit LTI platforms.',
      status: 'failed',
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test('maps ERR_NOT_FOUND to a missing-platform message', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: false, error: { code: 'ERR_NOT_FOUND' } })

    const state = await updateLtiPlatform(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('This LTI platform can no longer be found.')
  })

  test('maps any other error to the generic message', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: false, error: { code: 'ERR_DATABASE' } })

    const state = await updateLtiPlatform(IDLE, makeFormData())

    expect(state.message).toBe('Failed to update LTI platform.')
  })

  test('returns field errors for invalid endpoints without calling core', async () => {
    const state = await updateLtiPlatform(
      IDLE,
      makeFormData({
        ...FIELDS,
        authorization_endpoint: 'http://canvas.test.instructure.com/api/lti/authorize_redirect',
        jwks_uri: 'https://canvas.test.instructure.com/jwks#keys',
        authorization_server: '   ',
      })
    )

    expect(state.status).toBe('failed')
    expect(state.message).toBe('Unable to update LTI platform.')
    expect(state.errors.authorization_endpoint).toEqual([
      'Authorization endpoint must be an https URL without a fragment.',
    ])
    expect(state.errors.jwks_uri).toEqual(['JWKS URI must be an https URL without a fragment.'])
    expect(state.errors.authorization_server).toEqual(['Authorization server is required.'])
    expect(state.errors.token_endpoint).toBeUndefined()
    expect(mocks.updateLtiPlatform).not.toHaveBeenCalled()
  })

  test('accepts a bare host name as the authorization server', async () => {
    mocks.updateLtiPlatform.mockResolvedValue({ ok: true, data: { platform: FIELDS } })

    await expect(
      updateLtiPlatform(IDLE, makeFormData({ ...FIELDS, authorization_server: 'canvas.test' }))
    ).rejects.toBeInstanceOf(Redirected)
  })

  test('refuses without an admin session', async () => {
    mocks.getCoreAdminRequestContext.mockResolvedValue(undefined)

    const state = await updateLtiPlatform(IDLE, makeFormData())

    expect(state.message).toBe('Not logged in.')
    expect(mocks.updateLtiPlatform).not.toHaveBeenCalled()
  })
})

describe('suggestLtiPlatformEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreAdminRequestContext.mockResolvedValue(ADMIN_AUTH)
  })

  test("returns the adapter's endpoints", async () => {
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({ ok: true, data: ENDPOINTS })

    const result = await suggestLtiPlatformEndpoints('https://canvas.test.instructure.com')

    expect(result).toEqual({ ok: true, endpoints: ENDPOINTS })
    expect(mocks.suggestLtiPlatformEndpoints).toHaveBeenCalledWith(ADMIN_AUTH, {
      issuer: 'https://canvas.test.instructure.com',
    })
  })

  test('asks for a valid issuer when core rejects it', async () => {
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_VALIDATION' },
    })

    expect(await suggestLtiPlatformEndpoints('canvas')).toEqual({
      ok: false,
      message: 'Enter a valid https issuer first.',
    })
  })

  test('reports a permission refusal', async () => {
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_FORBIDDEN' },
    })

    const result = await suggestLtiPlatformEndpoints('https://canvas.test.instructure.com')

    expect(result.ok).toBe(false)
  })
})
