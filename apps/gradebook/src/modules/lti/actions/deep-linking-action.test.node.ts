import { validateInstructorActivityUrl } from '@modulus-learning/core/activity-url'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  handleDeepLink: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreUserRequestContext: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreUserRequestContext: mocks.getCoreUserRequestContext,
}))
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mocks.loggerError }),
}))

import { deepLinking } from './deep-linking-action'
import type { DeepLinkingFormState } from '../@types'

const IDLE: DeepLinkingFormState = { status: 'idle' }

const ACTIVITY_URL = 'https://elsewhere.test/newly-typed'
const LAUNCH_ID = '019c2d8e-842a-7715-a323-a7e31427db2d'
const ACTIVITY_CODE_ID = '019c2d8e-842a-7715-a323-a7e31427db2e'

const COMPONENTS =
  'Activity URLs cannot include query strings or fragments. Supply the activity URL without these components; Modulus does not currently support custom launch parameters.'
const SPACE = 'Activity URLs cannot contain literal spaces.'

/**
 * A stand-in for the command's own input schema, as the action reaches for it,
 * with core's instructor literal-space and component refinements.
 */
const inputSchema = z.object({
  activity_url: z.string().superRefine((value, ctx) => {
    const result = validateInstructorActivityUrl(value)
    if (result.ok) return
    if (result.reason === 'literal_space') ctx.addIssue({ code: 'custom', message: SPACE })
    if (result.reason === 'unsupported_url_components') {
      ctx.addIssue({ code: 'custom', message: COMPONENTS })
    }
  }),
  activity_code_id: z.string(),
  launch_id: z.string(),
})

const makeFormData = (activityUrl = ACTIVITY_URL): FormData => {
  const formData = new FormData()
  formData.append('activity_url', activityUrl)
  formData.append('activity_code_id', ACTIVITY_CODE_ID)
  formData.append('launch_id', LAUNCH_ID)
  return formData
}

describe('deepLinking error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    const handleDeepLink = Object.assign(mocks.handleDeepLink, {
      schemas: { input: inputSchema },
    })
    mocks.getCoreCommands.mockResolvedValue({ app: { lti: { handleDeepLink } } })
  })

  test('maps a policy denial onto the activity_url field', async () => {
    // The second code mapped onto this field. Without it the instructor sees
    // the generic "An error occurred." and is told nothing actionable.
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'This activity URL is not allowed by the sitewide allowlist.',
        details: { rejected: [{ url: ACTIVITY_URL, reason: 'activity_url_not_allowed' }] },
      },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('Invalid activity URL.')
    expect(state.errors?.activity_url?.[0]).toContain(ACTIVITY_URL)
    expect(state.errors?.activity_url?.[0]).toContain('Contact a Modulus administrator')

    // Returned before the error log, which serializes `result.error` whole --
    // `details.rejected` carries the full URL, query and fragment included.
    // An instructor typo is not an error, and core has already recorded the
    // denial at warn with the normalized origin and path alone.
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('discloses no rule and no url the instructor did not submit', async () => {
    // Same disclosure rule as the activity-code forms: an instructor is not
    // authorized to read site trust policy, and a denial is not a reason to
    // show it to them.
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'This activity URL is not allowed by the sitewide allowlist.',
        details: { rejected: [{ url: ACTIVITY_URL, reason: 'activity_url_not_allowed' }] },
      },
    })

    const state = await deepLinking(IDLE, makeFormData())
    const rendered = `${state.message} ${state.errors?.activity_url?.join(' ')}`

    expect(rendered).toContain(ACTIVITY_URL)
    expect(rendered).not.toContain('https://approved.test')
    expect(rendered).not.toMatch(/allowlist|allowed base url|rule for|administrator [a-z]+@/i)
  })

  test.each([
    [
      'ERR_DEEP_LINK_PREFIX_MISMATCH',
      'activity_url',
      'Supply an activity URL matching the configured prefix.',
      'Invalid activity URL.',
    ],
    [
      'ERR_DEEP_LINK_PREFIX_INVALID',
      'activity_code_id',
      "Correct this activity code's URL prefix before creating the link.",
      'Invalid activity code.',
    ],
  ] as const)('maps %s onto %s without the generic log', async (code, field, text, message) => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: { code, message: 'activity code url prefix failure' },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state).toEqual({ errors: { [field]: [text] }, message, status: 'failed' })
    // Fixed copy: neither the entered URL nor any stored prefix.
    expect(JSON.stringify(state)).not.toContain('elsewhere.test')
    expect(JSON.stringify(state)).not.toContain('content.test')
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('no longer maps an ERR_DEEP_LINKING message onto the activity url', async () => {
    // The old regex branch is gone: a message is not a contract.
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_DEEP_LINKING',
        message: 'activity url must start with https://content.test/',
      },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state).toEqual({ status: 'failed', message: 'An error occurred.' })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['activity_url_not_allowed', 'does not admit this new activity URL', true],
    ['malformed_url', 'new activities require HTTPS', false],
    ['url_too_long', '255-character storage limit', false],
    [undefined, 'Modulus could not register this activity URL', false],
    ['future_reason', 'Modulus could not register this activity URL', false],
  ])('maps a %s denial to its own guidance', async (reason, guidance, asksForAccess) => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'This activity URL is not allowed by the sitewide allowlist.',
        details: { rejected: [{ url: ACTIVITY_URL, reason }] },
      },
    })

    const state = await deepLinking(IDLE, makeFormData())
    const text = state.errors?.activity_url?.[0] ?? ''

    expect(text.startsWith(`${ACTIVITY_URL}. `)).toBe(true)
    expect(text).toContain(guidance)
    if (asksForAccess) {
      expect(text).toContain('Contact a Modulus administrator to request access.')
    } else {
      expect(text).not.toMatch(/administrator|request access/i)
    }
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('maps core validation issues on activity_url before logging', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'validation failed',
        details: { issues: [{ path: ['activity_url'], message: COMPONENTS }] },
      },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state).toEqual({
      errors: { activity_url: [COMPONENTS] },
      message: 'Invalid activity URL.',
      status: 'failed',
    })
    expect(state.errors?.activity_url?.[0]).not.toMatch(/administrator|request access/i)
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('rejects query and fragment input in the action before calling the command', async () => {
    // The action parses with the command's own schema first; this stand-in
    // mirrors core's component refinement.
    for (const url of [`${ACTIVITY_URL}?x=1`, `${ACTIVITY_URL}?`, `${ACTIVITY_URL}#`]) {
      mocks.handleDeepLink.mockClear()
      const state = await deepLinking(IDLE, makeFormData(url))

      expect(state.errors?.activity_url).toEqual([COMPONENTS])
      expect(mocks.handleDeepLink).not.toHaveBeenCalled()
    }
  })

  test('rejects a literal space in the action before calling the command, without logging', async () => {
    for (const url of [
      'https://elsewhere.test/newly typed',
      ' https://elsewhere.test/newly typed ',
      'https://elsewhere.test/one https://elsewhere.test/two',
      'https://elsewhere.test/newly typed?x=1',
    ]) {
      mocks.handleDeepLink.mockClear()
      const state = await deepLinking(IDLE, makeFormData(url))

      expect(state.errors?.activity_url).toEqual([SPACE])
      expect(JSON.stringify(state)).not.toContain('elsewhere.test')
      expect(JSON.stringify(state)).not.toMatch(/administrator|request access/i)
      expect(mocks.handleDeepLink).not.toHaveBeenCalled()
    }
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('passes a corrected %20 url to the command', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: true,
      data: { jwt: 'signed-jwt', return_url: 'https://canvas.test/deep_link_return' },
    })

    const state = await deepLinking(IDLE, makeFormData('https://elsewhere.test/newly%20typed'))

    expect(state.status).toBe('success')
    expect(mocks.handleDeepLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ activity_url: 'https://elsewhere.test/newly%20typed' })
    )
  })

  test('maps a core literal-space issue on activity_url before logging', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'validation failed',
        details: { issues: [{ path: ['activity_url'], message: SPACE }] },
      },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state).toEqual({
      errors: { activity_url: [SPACE] },
      message: 'Invalid activity URL.',
      status: 'failed',
    })
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('keeps an unrelated ERR_DEEP_LINKING failure on the generic fallback', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_DEEP_LINKING', message: 'deep-link launch not found' },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('An error occurred.')
    expect(state.errors).toBeUndefined()
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test('falls back to the generic failure when details carry no usable urls', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_ACTIVITY_URL_NOT_ALLOWED', message: 'denied', details: {} },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state).toEqual({ status: 'failed', message: 'An error occurred.' })
    // A contract mismatch is still recorded -- by code, never by URL.
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.loggerError.mock.calls)).toContain('ERR_ACTIVITY_URL_NOT_ALLOWED')
  })

  test('logs no url from an unusable denial payload', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'denied',
        details: { rejected: [{ href: `${ACTIVITY_URL}?token=synthetic` }] },
      },
    })

    await deepLinking(IDLE, makeFormData())

    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('elsewhere.test')
  })

  test('returns the signed content item on success', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: true,
      data: { jwt: 'signed-jwt', return_url: 'https://canvas.test/deep_link_return' },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.status).toBe('success')
    expect(state.result).toEqual({
      jwt: 'signed-jwt',
      return_url: 'https://canvas.test/deep_link_return',
    })
  })
})
