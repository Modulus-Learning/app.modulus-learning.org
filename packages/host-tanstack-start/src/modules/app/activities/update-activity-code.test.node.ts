import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateActivityCode: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreUserRequestContext: vi.fn(),
  loggerError: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreUserRequestContext: mocks.getCoreUserRequestContext,
}))
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mocks.loggerError }),
}))
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import { ACTIVITY_URL_MESSAGES, URL_PREFIX_MESSAGES } from './@types/validate-urls'
import { updateActivityCode } from './update-activity-code'
import type { ActivityCodeFormState } from './@types'

const IDLE: ActivityCodeFormState = { errors: {}, status: 'idle' }

const ID = '019c2d8e-842a-7715-a323-a7e31427db2d'
const GENERIC = 'There was an error updating your activity code.'
const ACCESS_REQUEST = /administrator|request access/i

const makeFormData = (urls: string, urlPrefix?: string): FormData => {
  const formData = new FormData()
  formData.append('id', ID)
  formData.append('urls', urls)
  if (urlPrefix !== undefined) formData.append('url_prefix', urlPrefix)
  return formData
}

const denialResult = (rejected: { url: string; reason?: string }[]) => ({
  ok: false as const,
  error: {
    code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
    message: 'activity URLs are not allowed by the sitewide allowlist.',
    details: { rejected },
  },
})

describe('updateActivityCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      app: { activities: { updateActivityCode: mocks.updateActivityCode } },
    })
    mocks.updateActivityCode.mockResolvedValue({ ok: true, data: { id: ID } })
  })

  test('rejects query and fragment lines, including empty ones, without calling core', async () => {
    const state = await updateActivityCode(
      IDLE,
      makeFormData(
        ['https://content.test/a?', 'https://content.test/ok', '', 'https://content.test/b#'].join(
          '\n'
        )
      )
    )

    expect(state.errors.urls).toEqual([
      `Lines 1, 4: ${ACTIVITY_URL_MESSAGES.unsupported_url_components}`,
    ])
    expect(mocks.updateActivityCode).not.toHaveBeenCalled()
  })

  test('rejects a prefix with an empty fragment on the prefix field', async () => {
    const state = await updateActivityCode(
      IDLE,
      makeFormData('https://content.test/course/a', 'https://content.test/course/#')
    )

    expect(state.errors.url_prefix).toEqual([URL_PREFIX_MESSAGES.unsupported_url_components])
    expect(mocks.updateActivityCode).not.toHaveBeenCalled()
  })

  test('rejects literal spaces on physical lines and the prefix without calling core', async () => {
    const lines = [
      'https://content.test/course/a b',
      '',
      'https://content.test/course/ok',
      'https://content.test/course/a https://content.test/course/b',
      'https://content.test/course/a b',
    ].join('\n')

    const urlState = await updateActivityCode(IDLE, makeFormData(lines))
    expect(urlState.errors.urls).toEqual([`Lines 1, 4, 5: ${ACTIVITY_URL_MESSAGES.literal_space}`])
    expect(urlState.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)

    const prefixState = await updateActivityCode(
      IDLE,
      makeFormData('https://content.test/course/ok', 'https://content.test/my course/')
    )
    expect(prefixState.errors.url_prefix).toEqual([URL_PREFIX_MESSAGES.literal_space])

    expect(mocks.updateActivityCode).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('accepts corrected %20 input', async () => {
    await updateActivityCode(
      IDLE,
      makeFormData('https://content.test/my%20course/a%20b', 'https://content.test/my%20course/')
    )

    expect(mocks.updateActivityCode).toHaveBeenCalledWith(expect.anything(), {
      id: ID,
      url_prefix: 'https://content.test/my%20course/',
      description: null,
      urls: ['https://content.test/my%20course/a%20b'],
    })
  })

  test('accepts canonical prefix variants and sends submitted spellings to core', async () => {
    await updateActivityCode(
      IDLE,
      makeFormData(
        'https://content.test/course/a\nHTTPS://CONTENT.TEST/course/b',
        'https://content.test:443/course/'
      )
    )

    expect(mocks.updateActivityCode).toHaveBeenCalledWith(expect.anything(), {
      id: ID,
      url_prefix: 'https://content.test:443/course/',
      description: null,
      urls: ['https://content.test/course/a', 'HTTPS://CONTENT.TEST/course/b'],
    })
    expect(mocks.redirect).toHaveBeenCalledWith(`/dashboard/activity-code/${ID}/activities`)
  })

  test('passes a parseable, currently inadmissible url to core', async () => {
    await updateActivityCode(IDLE, makeFormData('http://content.test/grandfathered'))

    expect(mocks.updateActivityCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ urls: ['http://content.test/grandfathered'] })
    )
    expect(mocks.redirect).toHaveBeenCalled()
  })

  test.each([
    ['activity_url_not_allowed', 'does not admit these new activity URLs', true],
    ['malformed_url', 'cannot contain credentials', false],
    ['url_too_long', '255-character storage limit', false],
    [undefined, 'Modulus could not register these activity URLs', false],
  ])('maps a %s denial to its guidance on every line', async (reason, guidance, asksForAccess) => {
    mocks.updateActivityCode.mockResolvedValue(
      denialResult([
        { url: 'https://elsewhere.test/one', reason },
        { url: 'https://ELSEWHERE.test/one', reason },
      ])
    )

    const state = await updateActivityCode(
      IDLE,
      makeFormData(
        'https://ELSEWHERE.test/one\n\nhttps://content.test/ok\nhttps://elsewhere.test/one'
      )
    )
    const message = state.errors.urls?.[0] ?? ''

    expect(message).toContain('Lines 1, 4: https://ELSEWHERE.test/one, https://elsewhere.test/one.')
    expect(message).toContain(guidance)
    if (asksForAccess) {
      expect(message).toContain('Contact a Modulus administrator to request access.')
    } else {
      expect(message).not.toMatch(ACCESS_REQUEST)
    }
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('gives a neutral failure for an unusable payload, logging no url', async () => {
    mocks.updateActivityCode.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
        message: 'denied',
        details: { rejected: 'https://elsewhere.test/one?token=synthetic' },
      },
    })

    const state = await updateActivityCode(IDLE, makeFormData('https://elsewhere.test/one'))

    expect(state).toEqual({ errors: {}, message: GENERIC, status: 'failed' })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain('elsewhere.test')
  })

  test('maps core validation issues to physical lines and the prefix field', async () => {
    mocks.updateActivityCode.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'validation failed',
        details: {
          issues: [
            { path: ['urls', 0], message: ACTIVITY_URL_MESSAGES.unsupported_url_components },
            { path: ['urls', 2], message: ACTIVITY_URL_MESSAGES.unsupported_url_components },
            { path: ['url_prefix'], message: URL_PREFIX_MESSAGES.malformed_url },
          ],
        },
      },
    })

    const state = await updateActivityCode(
      IDLE,
      makeFormData('\nhttps://content.test/a\nhttps://content.test/b\n\nhttps://content.test/c')
    )

    expect(state.errors).toEqual({
      urls: [`Lines 2, 5: ${ACTIVITY_URL_MESSAGES.unsupported_url_components}`],
      url_prefix: [URL_PREFIX_MESSAGES.malformed_url],
    })
    expect(state.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('maps a core literal-space issue to its physical line', async () => {
    mocks.updateActivityCode.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'validation failed',
        details: {
          issues: [{ path: ['urls', 1], message: ACTIVITY_URL_MESSAGES.literal_space }],
        },
      },
    })

    const state = await updateActivityCode(
      IDLE,
      makeFormData('https://content.test/a\n\n\nhttps://content.test/b')
    )

    expect(state.errors).toEqual({ urls: [`Line 4: ${ACTIVITY_URL_MESSAGES.literal_space}`] })
    expect(state.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('falls back to the generic, logged failure for any other error code', async () => {
    mocks.updateActivityCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_ACTIVITY_CODE_NOT_FOUND', message: 'not found' },
    })

    const state = await updateActivityCode(IDLE, makeFormData('https://content.test/a'))

    expect(state).toEqual({ errors: {}, message: GENERIC, status: 'failed' })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })
})
