import type { NextRequest } from 'next/server'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCoreCommands: vi.fn(),
  getCoreRequestContext: vi.fn(),
  handleLogin: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreRequestContext: mocks.getCoreRequestContext,
}))
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }))

import { POST } from './route'

const REDIRECT_URL = 'https://canvas.test/api/lti/authorize_redirect?state=state-1'

/**
 * Stands in for `core.app.lti.handleLogin`, which the route calls both as a
 * command and as the owner of the input schema it validates the form against.
 */
const loginCommand = () =>
  Object.assign(mocks.handleLogin, {
    schemas: {
      input: {
        safeParse: (value: Record<string, unknown>) =>
          typeof value.iss === 'string'
            ? { success: true as const, data: value }
            : { success: false as const, error: new Error('invalid') },
      },
    },
  })

const loginForm = () => {
  const form = new FormData()
  form.set('iss', 'https://canvas.test')
  form.set('login_hint', 'learner-1')
  return form
}

const post = async (form: FormData) =>
  await POST({
    url: 'https://gradebook.test/routes/lti/login',
    formData: async () => form,
  } as NextRequest)

/**
 * The status is load-bearing, not incidental. A 307 would preserve the POST and
 * the browser would post to `/lti/error`, which only answers GET -- so the
 * learner would get a 405 rather than the readable page. The empty non-JSON
 * body is the other half: no failure branch may still be returning the
 * `NextResponse.json({ status: 'failed' })` this replaced.
 */
const expectErrorRedirect = async (form: FormData, slug: string) => {
  const response = await post(form)

  expect(response.status).toBe(303)
  const location = new URL(String(response.headers.get('location')))
  expect(location.pathname).toBe('/lti/error')
  expect(location.searchParams.get('code')).toBe(slug)
  expect(await response.text()).toBe('')
  expect(response.headers.get('content-type') ?? '').not.toContain('json')
}

describe('LTI login route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreRequestContext.mockResolvedValue({})
    mocks.getCoreCommands.mockResolvedValue({ app: { lti: { handleLogin: loginCommand() } } })
  })

  test('redirects a malformed login request to invalid_request', async () => {
    await expectErrorRedirect(new FormData(), 'invalid_request')

    expect(mocks.handleLogin).not.toHaveBeenCalled()
  })

  test.each([
    ['ERR_INVALID_LOGIN', 'invalid_launch'],
    ['ERR_DATABASE', 'server_error'],
  ])('redirects a %s login failure to %s', async (code, slug) => {
    mocks.handleLogin.mockResolvedValue({ ok: false, error: { code, message: 'failed' } })

    await expectErrorRedirect(loginForm(), slug)
  })

  test('still redirects a successful login to the platform with its state cookie', async () => {
    mocks.handleLogin.mockResolvedValue({
      ok: true,
      data: { redirectUrl: REDIRECT_URL, stateId: 'state-1', stateValue: 'https://canvas.test' },
    })

    const response = await post(loginForm())

    // 303, not 307: the platform posts the login request as a form, and the
    // OIDC authentication request in this URL must be fetched with GET rather
    // than have that body replayed to the platform.
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(REDIRECT_URL)

    // The state cookie's attributes are unchanged by this task; asserted here
    // so the failure-branch rewrite above cannot quietly disturb them.
    const cookie = response.headers.get('set-cookie')
    expect(cookie).toContain('state-state-1=https%3A%2F%2Fcanvas.test')
    expect(cookie).toContain('Path=/routes/lti/launch')
    expect(cookie).toContain('SameSite=none')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Max-Age=120')
  })
})
