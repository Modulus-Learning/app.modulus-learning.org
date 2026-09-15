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

import { ACTIVITY_URL_MESSAGES, URL_PREFIX_MESSAGES } from './@types/validate-urls'
import { createActivityCode } from './create-activity-code'
import type { ActivityCodeFormState } from './@types'

const IDLE: ActivityCodeFormState = { errors: {}, status: 'idle' }

const GENERIC = 'There was an error submitting your activity code.'
const ACCESS_REQUEST = /administrator|request access/i

const makeFormData = (urls: string, urlPrefix?: string): FormData => {
  const formData = new FormData()
  formData.append('activity_code', 'brave-otter')
  formData.append('urls', urls)
  if (urlPrefix !== undefined) formData.append('url_prefix', urlPrefix)
  return formData
}

/** A denial as core reports it: canonical-sorted, with a reason per spelling. */
const denialResult = (rejected: { url: string; reason?: string }[]) => ({
  ok: false as const,
  error: {
    code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
    message: 'activity URLs are not allowed by the sitewide allowlist.',
    details: { rejected },
  },
})

/** Everything the action handed the logger, as one searchable string. */
const logged = () => JSON.stringify(mocks.loggerError.mock.calls)

describe('createActivityCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      app: { activities: { createActivityCode: mocks.createActivityCode } },
    })
    mocks.createActivityCode.mockResolvedValue({ ok: true, data: { id: 'code-1' } })
  })

  describe('host enforcement before core', () => {
    test.each([
      ['a query', 'https://content.test/lesson?x=1'],
      ['a fragment', 'https://content.test/lesson#top'],
      ['an empty query', 'https://content.test/lesson?'],
      ['an empty fragment', 'https://content.test/lesson#'],
    ])('rejects %s on its physical line without calling core', async (_, url) => {
      const state = await createActivityCode(
        IDLE,
        makeFormData(['https://content.test/ok', '', url].join('\n'))
      )

      expect(state.status).toBe('failed')
      expect(state.errors.urls).toEqual([
        `Line 3: ${ACTIVITY_URL_MESSAGES.unsupported_url_components}`,
      ])
      expect(state.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)
      expect(mocks.createActivityCode).not.toHaveBeenCalled()
    })

    test('rejects a prefix with a query or fragment on the prefix field', async () => {
      const state = await createActivityCode(
        IDLE,
        makeFormData('https://content.test/course/a', 'https://content.test/course/?term=fall')
      )

      expect(state.errors.url_prefix).toEqual([URL_PREFIX_MESSAGES.unsupported_url_components])
      expect(mocks.createActivityCode).not.toHaveBeenCalled()
    })

    test('rejects literal spaces on every physical line without calling core', async () => {
      const state = await createActivityCode(
        IDLE,
        makeFormData(
          [
            'https://content.test/ok',
            '',
            'https://content.test/lesson one',
            'https://content.test/one https://content.test/two',
            'https://content.test/lesson one',
            'https://content.test/lesson two#top',
          ].join('\r\n')
        )
      )

      expect(state).toEqual({
        errors: { urls: [`Lines 3, 4, 5, 6: ${ACTIVITY_URL_MESSAGES.literal_space}`] },
        message: 'Invalid URLs.',
        status: 'failed',
      })
      expect(state.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)
      expect(mocks.createActivityCode).not.toHaveBeenCalled()
      expect(mocks.loggerError).not.toHaveBeenCalled()
    })

    test('rejects a literal space in the prefix on the prefix field', async () => {
      const state = await createActivityCode(
        IDLE,
        makeFormData('https://content.test/course%20one/a', ' https://content.test/course one/ ')
      )

      expect(state.errors.url_prefix).toEqual([URL_PREFIX_MESSAGES.literal_space])
      expect(state.errors.url_prefix?.[0]).not.toMatch(ACCESS_REQUEST)
      expect(mocks.createActivityCode).not.toHaveBeenCalled()
    })

    test('accepts corrected %20 input and sends it unchanged', async () => {
      await createActivityCode(
        IDLE,
        makeFormData(
          'https://content.test/course%20one/lesson%20one\n\nhttps://content.test/course%20one/lesson%20one',
          'https://content.test/course%20one/'
        )
      )

      expect(mocks.createActivityCode).toHaveBeenCalledWith(expect.anything(), {
        code: 'brave-otter',
        url_prefix: 'https://content.test/course%20one/',
        description: null,
        urls: [
          'https://content.test/course%20one/lesson%20one',
          'https://content.test/course%20one/lesson%20one',
        ],
      })
    })

    test('treats a whitespace-only prefix as no constraint', async () => {
      await createActivityCode(IDLE, makeFormData('https://anywhere.test/a', '   '))

      expect(mocks.createActivityCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ url_prefix: null })
      )
    })

    test('reports prefix mismatches on every affected line', async () => {
      const state = await createActivityCode(
        IDLE,
        makeFormData(
          [
            'https://content.test/coursework',
            'HTTPS://CONTENT.TEST:443/course/a',
            'https://x.test/b',
          ].join('\n'),
          'https://content.test/course/'
        )
      )

      expect(state.errors.urls).toEqual([`Lines 1, 3: ${ACTIVITY_URL_MESSAGES.prefix_mismatch}`])
      expect(mocks.createActivityCode).not.toHaveBeenCalled()
    })

    test('sends submitted spellings and the entered prefix to core, blank lines removed', async () => {
      await createActivityCode(
        IDLE,
        makeFormData(
          [
            '',
            '  HTTPS://Content.test:443/course/a  ',
            'https://content.test/course/a%2Fb%3Fc%23d',
            '',
            'https://content.test/course/a',
          ].join('\r\n'),
          ' https://CONTENT.test/course/ '
        )
      )

      expect(mocks.createActivityCode).toHaveBeenCalledWith(expect.anything(), {
        code: 'brave-otter',
        url_prefix: 'https://CONTENT.test/course/',
        description: null,
        urls: [
          'HTTPS://Content.test:443/course/a',
          'https://content.test/course/a%2Fb%3Fc%23d',
          'https://content.test/course/a',
        ],
      })
      expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
    })

    test('applies no prefix constraint when none is set', async () => {
      await createActivityCode(IDLE, makeFormData('https://anywhere.test/a', ''))

      expect(mocks.createActivityCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ url_prefix: null, urls: ['https://anywhere.test/a'] })
      )
    })

    test('keeps the empty url list working', async () => {
      await createActivityCode(IDLE, makeFormData('\n\n'))

      expect(mocks.createActivityCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ urls: [] })
      )
    })
  })

  describe('admission stays with core', () => {
    const inadmissible = ['http://content.test/lesson', 'https://user:secret@content.test/lesson']

    test('passes parseable scheme and credential urls through to core', async () => {
      const state = await createActivityCode(IDLE, makeFormData(inadmissible.join('\n')))

      // An existing canonical activity at these URLs resolves in core without
      // a new client-side admission gate.
      expect(mocks.createActivityCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ urls: inadmissible })
      )
      expect(state).toBeUndefined()
      expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
    })

    test('shows syntax guidance when core refuses them as unseen', async () => {
      mocks.createActivityCode.mockResolvedValue(
        denialResult(inadmissible.map((url) => ({ url, reason: 'malformed_url' })))
      )

      const state = await createActivityCode(IDLE, makeFormData(inadmissible.join('\n')))
      const message = state.errors.urls?.[0] ?? ''

      expect(message).toContain(`Lines 1, 2: ${inadmissible.join(', ')}.`)
      expect(message).toContain('new activities require HTTPS')
      expect(message).toContain('cannot contain credentials')
      expect(message).not.toMatch(ACCESS_REQUEST)
    })
  })

  describe('registration denials', () => {
    test.each([
      ['activity_url_not_allowed', 'does not admit this new activity URL', true],
      ['malformed_url', 'new activities require HTTPS', false],
      ['url_too_long', '255-character storage limit', false],
    ])('maps %s to its own guidance', async (reason, guidance, asksForAccess) => {
      mocks.createActivityCode.mockResolvedValue(
        denialResult([{ url: 'https://elsewhere.test/one', reason }])
      )

      const state = await createActivityCode(
        IDLE,
        makeFormData('https://content.test/ok\nhttps://elsewhere.test/one')
      )

      expect(state.status).toBe('failed')
      expect(state.message).toBe('Some activity URLs could not be registered.')
      expect(state.errors.urls).toHaveLength(1)
      expect(state.errors.urls?.[0]).toContain('Line 2: https://elsewhere.test/one.')
      expect(state.errors.urls?.[0]).toContain(guidance)
      if (asksForAccess) {
        expect(state.errors.urls?.[0]).toContain('Contact a Modulus administrator')
      } else {
        expect(state.errors.urls?.[0]).not.toMatch(ACCESS_REQUEST)
      }
      // Returned before the error log, which would serialize the whole URL.
      expect(mocks.loggerError).not.toHaveBeenCalled()
    })

    test('orders a mixed batch by physical line, not by core order', async () => {
      mocks.createActivityCode.mockResolvedValue(
        denialResult([
          { url: 'https://a.test/long', reason: 'url_too_long' },
          { url: 'https://z.test/denied', reason: 'activity_url_not_allowed' },
          { url: 'HTTPS://Z.TEST/denied', reason: 'activity_url_not_allowed' },
        ])
      )

      const state = await createActivityCode(
        IDLE,
        makeFormData(
          [
            'https://z.test/denied',
            '',
            'https://a.test/long',
            'HTTPS://Z.TEST/denied',
            'https://z.test/denied',
          ].join('\n')
        )
      )

      const message = state.errors.urls?.[0] ?? ''
      expect(message.indexOf('Lines 1, 4, 5:')).toBe(0)
      expect(message.indexOf('Line 3: https://a.test/long.')).toBeGreaterThan(0)
      expect(message).toContain('https://z.test/denied, HTTPS://Z.TEST/denied.')
    })

    test('gives a neutral failure for a missing or unrecognized reason', async () => {
      mocks.createActivityCode.mockResolvedValue(
        denialResult([
          { url: 'https://elsewhere.test/one' },
          { url: 'https://elsewhere.test/two', reason: 'future_reason' },
        ])
      )

      const state = await createActivityCode(
        IDLE,
        makeFormData('https://elsewhere.test/one\nhttps://elsewhere.test/two')
      )

      expect(state.errors.urls).toEqual([
        'Lines 1, 2: https://elsewhere.test/one, https://elsewhere.test/two. Modulus could not register these activity URLs.',
      ])
      expect(mocks.loggerError).not.toHaveBeenCalled()
    })

    test('gives a neutral failure for an unusable payload, logging no url', async () => {
      mocks.createActivityCode.mockResolvedValue({
        ok: false,
        error: {
          code: 'ERR_ACTIVITY_URL_NOT_ALLOWED',
          message: 'denied',
          details: { rejected: [{ href: 'https://elsewhere.test/secret-path?token=synthetic' }] },
        },
      })

      const state = await createActivityCode(IDLE, makeFormData('https://elsewhere.test/one'))

      expect(state).toEqual({ errors: {}, message: GENERIC, status: 'failed' })
      expect(mocks.loggerError).toHaveBeenCalledTimes(1)
      expect(logged()).toContain('ERR_ACTIVITY_URL_NOT_ALLOWED')
      expect(logged()).not.toContain('elsewhere.test')
    })

    test('discloses no rule and no url the instructor did not submit', async () => {
      mocks.createActivityCode.mockResolvedValue(
        denialResult([{ url: 'https://elsewhere.test/one', reason: 'activity_url_not_allowed' }])
      )

      const state = await createActivityCode(IDLE, makeFormData('https://elsewhere.test/one'))
      const rendered = `${state.message} ${state.errors.urls?.join(' ')}`

      expect(rendered).toContain('https://elsewhere.test/one')
      expect(rendered).not.toContain('https://approved.test')
      expect(rendered).not.toMatch(/allowlist|allowed base url|rule for|administrator [a-z]+@/i)
    })
  })

  describe('core validation issues', () => {
    test('maps url and prefix issues to their fields and lines before logging', async () => {
      // Host validation normally catches these first; this is core's own
      // enforcement, reached if the two ever disagree.
      mocks.createActivityCode.mockResolvedValue({
        ok: false,
        error: {
          code: 'ERR_VALIDATION',
          message: 'validation failed',
          details: {
            issues: [
              { path: ['urls', 1], message: 'Core component warning.' },
              { path: ['url_prefix'], message: URL_PREFIX_MESSAGES.url_too_long },
            ],
          },
        },
      })

      const state = await createActivityCode(
        IDLE,
        makeFormData('https://content.test/a\n\nhttps://content.test/b', 'https://content.test/')
      )

      expect(state).toEqual({
        errors: {
          urls: ['Line 3: Core component warning.'],
          url_prefix: [URL_PREFIX_MESSAGES.url_too_long],
        },
        message: 'Invalid URLs.',
        status: 'failed',
      })
      expect(mocks.loggerError).not.toHaveBeenCalled()
    })
  })

  test('maps core literal-space issues to physical lines without access guidance', async () => {
    mocks.createActivityCode.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'validation failed',
        details: {
          issues: [
            { path: ['urls', 0], message: ACTIVITY_URL_MESSAGES.literal_space },
            { path: ['urls', 2], message: ACTIVITY_URL_MESSAGES.literal_space },
            { path: ['url_prefix'], message: URL_PREFIX_MESSAGES.literal_space },
          ],
        },
      },
    })

    const state = await createActivityCode(
      IDLE,
      makeFormData(
        '\nhttps://content.test/a\nhttps://content.test/b\n\nhttps://content.test/a',
        'https://content.test/'
      )
    )

    expect(state.errors).toEqual({
      urls: [`Lines 2, 5: ${ACTIVITY_URL_MESSAGES.literal_space}`],
      url_prefix: [URL_PREFIX_MESSAGES.literal_space],
    })
    expect(JSON.stringify(state.errors)).not.toMatch(ACCESS_REQUEST)
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test('falls back to the generic, logged failure for any other error code', async () => {
    mocks.createActivityCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_DATABASE', message: 'database error' },
    })

    const state = await createActivityCode(IDLE, makeFormData('https://content.test/a'))

    expect(state).toEqual({ errors: {}, message: GENERIC, status: 'failed' })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })
})
