import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createActivityCode: vi.fn(),
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

import { createActivityCode } from './create-activity-code'
import { readRejectedUrls, rejectedUrlsMessage } from './rejected-urls'
import type { ActivityCodeFormState } from './@types'

const IDLE: ActivityCodeFormState = { errors: {}, status: 'idle' }

const SUBMITTED = [
  'https://elsewhere.test/one',
  'https://content.test/allowed',
  'https://elsewhere.test/two',
]

const makeFormData = (urls: string[] = SUBMITTED): FormData => {
  const formData = new FormData()
  formData.append('activity_code', 'brave-otter')
  formData.append('urls', urls.join('\n'))
  return formData
}

/** The denial as core actually reports it: sorted, with a reason per URL. */
const denialResult = (rejected: { url: string; reason: string }[]) => ({
  ok: false as const,
  error: {
    code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
    message: '2 activity URLs are not allowed by the sitewide allowlist.',
    details: { rejected },
  },
})

describe('createActivityCode denial handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      app: { activities: { createActivityCode: mocks.createActivityCode } },
    })
  })

  test('populates errors.urls with every rejected url', async () => {
    mocks.createActivityCode.mockResolvedValue(
      denialResult([
        { url: 'https://elsewhere.test/one', reason: 'activity_url_not_allowed' },
        { url: 'https://elsewhere.test/two', reason: 'activity_url_not_allowed' },
      ])
    )

    const state = await createActivityCode(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('Some activity URLs are not allowed.')
    expect(state.errors.urls).toHaveLength(1)
    // Every offending URL, not just the first: the instructor fixes them in
    // one form and needs the whole list.
    expect(state.errors.urls?.[0]).toContain('https://elsewhere.test/one')
    expect(state.errors.urls?.[0]).toContain('https://elsewhere.test/two')
    expect(state.errors.urls?.[0]).toContain('Contact a Modulus administrator')
  })

  test('discloses no rule and no url the instructor did not submit', async () => {
    // The disclosure guard on the instructor-visibility decision. An
    // instructor is not authorized to read site trust policy, and a denial is
    // not a reason to show it to them.
    mocks.createActivityCode.mockResolvedValue(
      denialResult([{ url: 'https://elsewhere.test/one', reason: 'activity_url_not_allowed' }])
    )

    const state = await createActivityCode(IDLE, makeFormData())
    const rendered = `${state.message} ${state.errors.urls?.join(' ')}`

    // The one URL core rejected, and nothing about what *is* allowed.
    expect(rendered).toContain('https://elsewhere.test/one')
    expect(rendered).not.toContain('https://approved.test')
    expect(rendered).not.toMatch(/allowlist|allowed base url|rule for|administrator [a-z]+@/i)
  })

  test('reports a malformed url denial the same way', async () => {
    mocks.createActivityCode.mockResolvedValue(
      denialResult([{ url: 'https://elsewhere.test/one', reason: 'malformed_url' }])
    )

    const state = await createActivityCode(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.errors.urls?.[0]).toContain('https://elsewhere.test/one')
  })

  test('falls back to the generic failure for any other error code', async () => {
    mocks.createActivityCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_DATABASE', message: 'database error' },
    })

    const state = await createActivityCode(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('There was an error submitting your activity code.')
    expect(state.errors).toEqual({})
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test('falls back to the generic failure when details carry no usable urls', async () => {
    // `ErrorReport.details` is `Record<string, unknown>`; a shape mismatch must
    // degrade to the generic message rather than throw inside a server action.
    mocks.createActivityCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_ACTIVITY_URL_NOT_ALLOWED', message: 'denied', details: {} },
    })

    const state = await createActivityCode(IDLE, makeFormData())

    expect(state.status).toBe('failed')
    expect(state.message).toBe('There was an error submitting your activity code.')
  })

  test('redirects on success, with no url error', async () => {
    mocks.createActivityCode.mockResolvedValue({ ok: true, data: { id: 'code-1' } })

    await createActivityCode(IDLE, makeFormData(['https://content.test/allowed']))

    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})

describe('readRejectedUrls', () => {
  test('reads the urls core sends', () => {
    expect(
      readRejectedUrls({
        rejected: [
          { url: 'https://a.test/one', reason: 'activity_url_not_allowed' },
          { url: 'https://b.test/two', reason: 'url_too_long' },
        ],
      })
    ).toEqual(['https://a.test/one', 'https://b.test/two'])
  })

  test('returns nothing for a shape it does not recognize', () => {
    // Typed defensively rather than asserted: this is the first place the host
    // reads `error.details` at all.
    expect(readRejectedUrls(undefined)).toEqual([])
    expect(readRejectedUrls({})).toEqual([])
    expect(readRejectedUrls({ rejected: 'not-an-array' })).toEqual([])
    expect(readRejectedUrls({ rejected: [null, 42, { reason: 'no url' }, { url: 7 }] })).toEqual([])
  })

  test('keeps the order core sent, which is sorted and not the submission order', () => {
    // The registration loop sorts before evaluating, so these do not arrive in
    // the order the instructor typed the lines.
    expect(
      readRejectedUrls({
        rejected: [{ url: 'https://a.test/1' }, { url: 'https://z.test/2' }],
      })
    ).toEqual(['https://a.test/1', 'https://z.test/2'])
  })
})

describe('rejectedUrlsMessage', () => {
  test('names the submitted urls and who can approve them', () => {
    const message = rejectedUrlsMessage(['https://a.test/one', 'https://b.test/two'])

    expect(message).toBe(
      'This Modulus site does not allow these activity URLs: https://a.test/one, https://b.test/two. Contact a Modulus administrator to request access.'
    )
  })
})
