import type { NextRequest } from 'next/server'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  deleteCookie: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreRequestContext: vi.fn(),
  handleLaunch: vi.fn(),
  redirect: vi.fn(),
  setUserSession: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreRequestContext: mocks.getCoreRequestContext,
}))
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }))
vi.mock('@/modules/app/session/storage', () => ({ setUserSession: mocks.setUserSession }))

import { POST } from './route'

describe('LTI launch route', () => {
  beforeEach(() => {
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
  })

  test('hands only the opaque scope id to the first-party interstitial', async () => {
    const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
    const activityUrl = 'https://content.test/activity?existing=one#authored-fragment'
    const tokens = {
      access: { token: 'access', expiration_in_ms: 60_000 },
      refresh: { token: 'refresh', expiration_in_ms: 120_000 },
      remember_me: false,
    }
    mocks.handleLaunch.mockResolvedValue({
      ok: true,
      data: {
        type: 'start-activity',
        activity_code: 'course-code',
        activity_url: activityUrl,
        scope_id: scopeId,
        scope_name: 'Autumn 2026',
        tokens,
      },
    })

    const form = new FormData()
    form.set('id_token', 'signed-token')
    form.set('state', 'state-value')

    await expect(POST({ formData: async () => form } as NextRequest)).rejects.toThrow(
      'NEXT_REDIRECT'
    )

    expect(mocks.setUserSession).toHaveBeenCalledWith(tokens)
    const target = String(mocks.redirect.mock.calls[0]?.[0])
    const redirectUrl = new URL(target, 'https://gradebook.test')
    expect(target).toBe(
      `/lti/launch/course-code/https://content.test/activity?existing=one&scope_id=${scopeId}#authored-fragment`
    )
    expect(target).toContain(activityUrl.replace('#authored-fragment', ''))
    expect(target).not.toContain(encodeURIComponent(activityUrl))
    expect(redirectUrl.searchParams.get('scope_id')).toBe(scopeId)
    expect(target).not.toContain('Autumn 2026')
  })
})
