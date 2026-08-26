import type { NextRequest } from 'next/server'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  deleteCookie: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreRequestContext: vi.fn(),
  getServerConfig: vi.fn(),
  handleLaunch: vi.fn(),
  redirect: vi.fn(),
  setUserSession: vi.fn(),
}))

vi.mock('@/config', () => ({ getServerConfig: mocks.getServerConfig }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreRequestContext: mocks.getCoreRequestContext,
}))
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }))
vi.mock('@/modules/app/session/storage', () => ({ setUserSession: mocks.setUserSession }))

import { POST } from './route'

const resetLaunchMocks = () => {
  vi.clearAllMocks()
  mocks.cookies.mockResolvedValue({
    get: () => ({ value: 'https://canvas.test' }),
    delete: mocks.deleteCookie,
  })
  mocks.getCoreRequestContext.mockResolvedValue({})
  mocks.getCoreCommands.mockResolvedValue({
    app: { lti: { handleLaunch: mocks.handleLaunch } },
  })
  mocks.setUserSession.mockResolvedValue(undefined)
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
}

describe('LTI launch route', () => {
  beforeEach(resetLaunchMocks)

  const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
  const activityId = '019c2d8e-9f01-7a4e-9c2f-2b7c1d9a5e11'
  const modulusServerUrl = 'https://modulus.test'
  const activityUrl = 'https://content.test/activity?existing=one#authored-fragment'
  const tokens = {
    access: { token: 'access', expiration_in_ms: 60_000 },
    refresh: { token: 'refresh', expiration_in_ms: 120_000 },
    remember_me: false,
  }

  const launchData = (overrides: { activity_url?: string; activity_code?: string } = {}) => ({
    type: 'start-activity',
    activity_code: overrides.activity_code ?? 'course-code',
    activity_id: activityId,
    activity_url: overrides.activity_url ?? activityUrl,
    modulus_server_url: modulusServerUrl,
    scope_id: scopeId,
    scope_name: 'Autumn 2026',
    tokens,
  })

  /** Drives a successful launch and returns the target the route redirected to. */
  const launchTo = async (
    mode: 'never' | 'always',
    overrides: { activity_url?: string; activity_code?: string } = {}
  ): Promise<string> => {
    mocks.getServerConfig.mockReturnValue({ lti: { launchInterstitial: mode } })
    mocks.handleLaunch.mockResolvedValue({ ok: true, data: launchData(overrides) })

    const form = new FormData()
    form.set('id_token', 'signed-token')
    form.set('state', 'state-value')

    await expect(
      POST({
        url: 'https://gradebook.test/routes/lti/launch',
        formData: async () => form,
      } as NextRequest)
    ).rejects.toThrow('NEXT_REDIRECT')

    return String(mocks.redirect.mock.calls[0]?.[0])
  }

  test('redirects straight to the activity under the default configuration', async () => {
    const target = await launchTo('never')
    const destination = new URL(target)

    expect(destination.origin + destination.pathname).toBe('https://content.test/activity')
    expect(destination.searchParams.get('modulus')).toBe(modulusServerUrl)
    expect(destination.searchParams.get('scope_id')).toBe(scopeId)
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.hash).toBe('#authored-fragment')
    expect(target).not.toContain('/lti/launch/')
  })

  test('redirects to the id-keyed interstitial under always', async () => {
    const target = await launchTo('always')

    expect(target).toBe(`/lti/launch/${activityId}?scope_id=${scopeId}`)
    expect(target).not.toContain('content.test')
  })

  test.each(['never', 'always'] as const)(
    'sets the session cookie before redirecting in %s mode',
    async (mode) => {
      await launchTo(mode)

      // The agent's later /routes/agent/authorize request depends on this
      // ordering: the session must exist before the browser leaves.
      expect(mocks.setUserSession).toHaveBeenCalledWith(tokens)
      expect(mocks.setUserSession.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.redirect.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
      )
    }
  )

  test.each(['never', 'always'] as const)(
    'never puts the scope name in the target, in %s mode',
    async (mode) => {
      const target = await launchTo(mode)

      expect(target).not.toContain('Autumn 2026')
      expect(target).not.toContain(encodeURIComponent('Autumn 2026'))
      expect(target).not.toContain('scope_name')
    }
  )

  test('preserves an authored query, fragment, and percent escape in never mode', async () => {
    // The case that fails today through the catch-all. The `always` equivalent
    // is not assertable here -- this route emits only
    // `/lti/launch/{id}?scope_id=...` -- and lives in the page's own test.
    const authored = 'https://content.test/a%20b/activity?discount=50%25&existing=one#authored'
    const destination = new URL(await launchTo('never', { activity_url: authored }))

    expect(destination.pathname).toBe('/a%20b/activity')
    expect(destination.searchParams.get('discount')).toBe('50%')
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.hash).toBe('#authored')
  })

  test.each(['never', 'always'] as const)(
    'produces a valid destination for an unresolvable activity code in %s mode',
    async (mode) => {
      // This is where the stricter-than-the-handler defect is observable: the
      // launch handler tolerates a code that no longer resolves, and after this
      // change nothing downstream consumes the code at all.
      const target = await launchTo(mode, { activity_code: 'retired-code' })

      expect(target).not.toContain('retired-code')
      expect(target.length).toBeGreaterThan(0)
      expect(mocks.setUserSession).toHaveBeenCalledWith(tokens)
    }
  )

  test.each(['never', 'always'] as const)(
    'ignores role information entirely when choosing a target in %s mode',
    async (mode) => {
      // `handleActivityLaunch` decides enrollment without distinguishing roles
      // and returns a role-free response, so an instructor launch and a learner
      // launch are the same input here. What this asserts is that the route adds
      // no branch of its own: role data present in the response changes nothing.
      const plain = await launchTo(mode)

      resetLaunchMocks()
      mocks.getServerConfig.mockReturnValue({ lti: { launchInterstitial: mode } })
      mocks.handleLaunch.mockResolvedValue({
        ok: true,
        data: {
          ...launchData(),
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
        },
      })
      const form = new FormData()
      form.set('id_token', 'signed-token')
      form.set('state', 'state-value')
      await expect(
        POST({
          url: 'https://gradebook.test/routes/lti/launch',
          formData: async () => form,
        } as NextRequest)
      ).rejects.toThrow('NEXT_REDIRECT')
      const withRole = String(mocks.redirect.mock.calls[0]?.[0])

      expect(withRole).toBe(plain)
      expect(withRole).not.toContain('Instructor')
    }
  )

  describe('failure branches', () => {
    const launchForm = () => {
      const form = new FormData()
      form.set('id_token', 'signed-token')
      form.set('state', 'state-value')
      return form
    }

    const post = async (form: FormData) =>
      await POST({
        url: 'https://gradebook.test/routes/lti/launch',
        formData: async () => form,
      } as NextRequest)

    /**
     * The status is load-bearing, not incidental. A 307 would preserve the
     * POST and the browser would post to `/lti/error`, which only answers GET
     * -- so the learner would get a 405 rather than the readable page. The
     * empty non-JSON body is the other half: no failure branch may still be
     * returning the `NextResponse.json({ status: 'failed' })` this replaced.
     */
    const expectErrorRedirect = async (form: FormData, slug: string) => {
      const response = await post(form)

      expect(response.status).toBe(303)
      const location = new URL(String(response.headers.get('location')))
      expect(location.pathname).toBe('/lti/error')
      expect(location.searchParams.get('code')).toBe(slug)
      expect(await response.text()).toBe('')
      expect(response.headers.get('content-type') ?? '').not.toContain('json')
      expect(mocks.redirect).not.toHaveBeenCalled()
    }

    test('redirects a malformed authentication response to invalid_request', async () => {
      await expectErrorRedirect(new FormData(), 'invalid_request')

      expect(mocks.handleLaunch).not.toHaveBeenCalled()
      expect(mocks.setUserSession).not.toHaveBeenCalled()
    })

    test('redirects a missing state cookie to session_expired', async () => {
      mocks.cookies.mockResolvedValue({ get: () => undefined, delete: mocks.deleteCookie })

      await expectErrorRedirect(launchForm(), 'session_expired')

      expect(mocks.handleLaunch).not.toHaveBeenCalled()
      expect(mocks.setUserSession).not.toHaveBeenCalled()
    })

    test.each([
      ['ERR_INVALID_LAUNCH', 'invalid_launch'],
      ['ERR_VALIDATION', 'invalid_request'],
      ['ERR_DATABASE', 'server_error'],
      // Token signing runs on every launch, so this is a live path rather than
      // a hypothetical one: an outage must not tell the learner that their
      // course link is at fault.
      ['ERR_JWT_ENCODE', 'server_error'],
    ])('redirects a %s launch failure to %s', async (code, slug) => {
      mocks.handleLaunch.mockResolvedValue({ ok: false, error: { code, message: 'failed' } })

      await expectErrorRedirect(launchForm(), slug)

      expect(mocks.setUserSession).not.toHaveBeenCalled()
    })
  })
})
