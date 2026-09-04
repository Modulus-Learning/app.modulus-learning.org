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

/** The command's own input schema, as the action reaches for it. */
const inputSchema = z.object({
  activity_url: z.string(),
  activity_code_id: z.string(),
  launch_id: z.string(),
})

const makeFormData = (): FormData => {
  const formData = new FormData()
  formData.append('activity_url', ACTIVITY_URL)
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

  test('still maps the per-code prefix violation by its message', async () => {
    // The existing branch, untouched: the form maps two codes onto
    // `activity_url`, and this one is matched on the message rather than a code.
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_DEEP_LINKING',
        message: 'activity url must start with https://content.test/',
      },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.message).toBe('Invalid activity URL.')
    expect(state.errors?.activity_url?.[0]).toBe(
      'activity url must start with https://content.test/'
    )
  })

  test('falls back to the generic failure for any other error', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_DEEP_LINKING', message: 'deep-link launch not found' },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('An error occurred.')
    expect(state.errors).toBeUndefined()
  })

  test('falls back to the generic failure when details carry no usable urls', async () => {
    mocks.handleDeepLink.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_ACTIVITY_URL_NOT_ALLOWED', message: 'denied', details: {} },
    })

    const state = await deepLinking(IDLE, makeFormData())

    expect(state.message).toBe('An error occurred.')
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
