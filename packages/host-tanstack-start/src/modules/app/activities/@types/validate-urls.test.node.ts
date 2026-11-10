import { describe, expect, test } from 'vitest'

import {
  ACTIVITY_URL_MESSAGES,
  DEEP_LINK_PREFIX_MESSAGES,
  formatLineMessages,
  readUrlLines,
  URL_PREFIX_MESSAGES,
  validateDeepLinkActivityUrl,
  validateUrlPrefix,
  validateUrls,
} from './validate-urls'

const COMPONENTS = ACTIVITY_URL_MESSAGES.unsupported_url_components
const SPACE = ACTIVITY_URL_MESSAGES.literal_space

describe('readUrlLines', () => {
  test('keeps the physical line of every submitted url, counting blank lines', () => {
    expect(
      readUrlLines('\nhttps://a.test/one\n\n  https://b.test/two  \nhttps://a.test/one\n')
    ).toEqual({
      urls: ['https://a.test/one', 'https://b.test/two', 'https://a.test/one'],
      lineNumbers: [2, 4, 5],
    })
  })

  test('handles the CRLF newlines a browser submits', () => {
    expect(readUrlLines('https://a.test/one\r\n\r\nhttps://b.test/two')).toEqual({
      urls: ['https://a.test/one', 'https://b.test/two'],
      lineNumbers: [1, 3],
    })
  })

  test('returns nothing for empty or missing text', () => {
    expect(readUrlLines('')).toEqual({ urls: [], lineNumbers: [] })
    expect(readUrlLines(null)).toEqual({ urls: [], lineNumbers: [] })
    expect(readUrlLines(' \n \n')).toEqual({ urls: [], lineNumbers: [] })
  })
})

describe('formatLineMessages', () => {
  test('orders by line and lists lines that share a message together', () => {
    expect(
      formatLineMessages([
        { line: 5, message: 'A.' },
        { line: 3, message: 'B.' },
        { line: 2, message: 'A.' },
      ])
    ).toBe('Lines 2, 5: A. Line 3: B.')
  })
})

describe('validateUrlPrefix', () => {
  test.each([
    ['', true],
    ['   ', true],
    [null, true],
    [undefined, true],
    ['https://content.test', true],
    ['https://content.test/course/', true],
    ['HTTPS://Content.test:443/course', true],
    ['https://content.test/%3Fnot-a-query/%23not-a-fragment', true],
    ['https://content.test/course%20one/', true],
    ['  https://content.test/course/  ', true],
    // Parseable prefixes pass: scheme and credentials are admission rules for
    // unseen activities, not prefix syntax.
    ['http://content.test/course', true],
  ])('accepts %j', (value, valid) => {
    expect(validateUrlPrefix(value).valid).toBe(valid)
  })

  test.each([
    ['https://content.test/course?term=fall', URL_PREFIX_MESSAGES.unsupported_url_components],
    ['https://content.test/course#top', URL_PREFIX_MESSAGES.unsupported_url_components],
    ['https://content.test/course?', URL_PREFIX_MESSAGES.unsupported_url_components],
    ['https://content.test/course#', URL_PREFIX_MESSAGES.unsupported_url_components],
    ['https://content.test/course one/', URL_PREFIX_MESSAGES.literal_space],
    [' https://content.test/course one/ ', URL_PREFIX_MESSAGES.literal_space],
    // The space warning takes precedence over the component warning.
    ['https://content.test/course one?term=fall', URL_PREFIX_MESSAGES.literal_space],
    ['content.test/course', URL_PREFIX_MESSAGES.malformed_url],
    ['https://', URL_PREFIX_MESSAGES.malformed_url],
  ])('rejects %j', (value, message) => {
    expect(validateUrlPrefix(value)).toEqual({ valid: false, message })
  })

  test('measures the canonical length, not the typed length', () => {
    const path = (length: number) => `/${'a'.repeat(length)}`
    const origin = 'https://content.test'

    // 255 canonical characters pass; 256 fail.
    expect(validateUrlPrefix(`${origin}${path(255 - origin.length - 1)}`).valid).toBe(true)
    expect(validateUrlPrefix(`${origin}${path(256 - origin.length - 1)}`)).toEqual({
      valid: false,
      message: URL_PREFIX_MESSAGES.url_too_long,
    })

    // An explicit default port shrinks a typed 258 back to 254.
    const shrinking = `https://content.test:443${path(254 - origin.length - 1)}`
    expect(shrinking.length).toBeGreaterThan(255)
    expect(validateUrlPrefix(shrinking).valid).toBe(true)

    // Percent-encoding grows a typed prefix within 255 beyond it.
    const growing = `${origin}/${'é'.repeat(120)}`
    expect(growing.length).toBeLessThanOrEqual(255)
    expect(validateUrlPrefix(growing).message).toBe(URL_PREFIX_MESSAGES.url_too_long)
  })
})

describe('validateUrls', () => {
  test('keeps the empty-list behaviour', () => {
    expect(validateUrls(null)).toEqual({ valid: false, message: 'No URLs provided.' })
    expect(validateUrls([])).toEqual({ valid: false, message: 'No URLs provided.' })
    expect(validateUrls(['', '  ']).valid).toBe(true)
  })

  test('accepts parseable urls, including ones only core can admit or refuse', () => {
    expect(
      validateUrls([
        'https://content.test/lesson',
        'HTTPS://CONTENT.TEST:443/lesson',
        'https://content.test/a%2Fb/%3F/%23',
        'http://localhost:3000/lesson',
        // Not admissible for an unseen activity, but possibly grandfathered:
        // core decides, so the form must not block them.
        'http://content.test/lesson',
        'https://user:secret@content.test/lesson',
        // A scheme inside a path is not a second URL.
        'https://content.test/redirect/https://elsewhere.test',
      ]).valid
    ).toBe(true)
  })

  test('reports every invalid line against its physical line number', () => {
    const result = validateUrls([
      'https://content.test/ok',
      '',
      'https://content.test/lesson?x=1',
      'not a url',
      'https://content.test/lesson#',
      'nope',
    ])

    expect(result.valid).toBe(false)
    expect(result.message).toBe(
      `Lines 3, 5: ${COMPONENTS} Line 4: ${SPACE} Line 6: ${ACTIVITY_URL_MESSAGES.malformed_url}`
    )
  })

  test('rejects an empty query or fragment, but not an encoded delimiter', () => {
    expect(validateUrls(['https://content.test/lesson?']).message).toBe(`Line 1: ${COMPONENTS}`)
    expect(validateUrls(['https://content.test/lesson#']).message).toBe(`Line 1: ${COMPONENTS}`)
    expect(validateUrls(['https://content.test/lesson%3Fx%23y']).valid).toBe(true)
  })

  test('rejects two urls pasted onto one line with the literal-space warning', () => {
    expect(validateUrls(['https://a.test/one https://b.test/two']).message).toBe(`Line 1: ${SPACE}`)
  })

  test('rejects an inner literal space on every physical line, but accepts %20', () => {
    const result = validateUrls([
      '',
      'https://content.test/lesson one',
      '  https://content.test/ok  ',
      'https://content.test/lesson%20one',
      'https://content.test/lesson one',
      // The space warning takes precedence over the component warning.
      'https://content.test/lesson two?x=1',
    ])

    expect(result).toEqual({ valid: false, message: `Lines 2, 5, 6: ${SPACE}` })
    expect(result.message).not.toMatch(/administrator|request access/i)
    expect(validateUrls(['https://content.test/lesson%20one']).valid).toBe(true)
  })

  test('applies an encoded-space prefix canonically', () => {
    expect(
      validateUrls(['https://content.test/course%20one/a'], 'https://content.test/course%20one/')
        .valid
    ).toBe(true)
  })

  test('leaves a spaced prefix to its own field', () => {
    expect(
      validateUrls(['https://content.test/course%20one/a'], 'https://content.test/course one/')
        .valid
    ).toBe(true)
  })

  test('applies the prefix canonically, with string-prefix semantics', () => {
    const lines = [
      'HTTPS://Content.test:443/course/one',
      'https://content.test/coursework',
      'https://content.test/other',
    ]

    expect(validateUrls(lines, 'https://content.test/course').message).toBe(
      `Line 3: ${ACTIVITY_URL_MESSAGES.prefix_mismatch}`
    )
    // An authored trailing slash is kept, so `/coursework` no longer matches.
    expect(validateUrls(lines, 'https://CONTENT.test/course/').message).toBe(
      `Lines 2, 3: ${ACTIVITY_URL_MESSAGES.prefix_mismatch}`
    )
    // Origin-only prefixes gain their root on both sides.
    expect(validateUrls(lines, 'https://content.test:443').valid).toBe(true)
  })

  test('applies no prefix when none is set', () => {
    expect(validateUrls(['https://elsewhere.test/one'], '').valid).toBe(true)
    expect(validateUrls(['https://elsewhere.test/one'], null).valid).toBe(true)
  })

  test('leaves an invalid prefix to its own field rather than failing every line', () => {
    expect(validateUrls(['https://content.test/one'], 'https://content.test/?x').valid).toBe(true)
  })

  test('never echoes a submitted value', () => {
    const secret = 'https://content.test/lesson?token=synthetic-secret'
    expect(validateUrls([secret], 'https://content.test/other').message).not.toContain(
      'synthetic-secret'
    )
  })
})

describe('validateDeepLinkActivityUrl', () => {
  test('requires a value', () => {
    expect(validateDeepLinkActivityUrl('  ', null)).toEqual({
      activity_url: ACTIVITY_URL_MESSAGES.required,
    })
  })

  test('validates components even when no prefix applies', () => {
    expect(validateDeepLinkActivityUrl('https://content.test/a?', null)).toEqual({
      activity_url: COMPONENTS,
    })
    expect(validateDeepLinkActivityUrl('https://content.test/a', '')).toEqual({})
    expect(validateDeepLinkActivityUrl('nope', undefined)).toEqual({
      activity_url: ACTIVITY_URL_MESSAGES.malformed_url,
    })
  })

  test('rejects a literal space in the url, with or without a prefix, but accepts %20', () => {
    for (const prefix of [null, '', 'https://content.test/']) {
      expect(validateDeepLinkActivityUrl('https://content.test/lesson one', prefix)).toEqual({
        activity_url: SPACE,
      })
      expect(validateDeepLinkActivityUrl(' https://content.test/lesson one? ', prefix)).toEqual({
        activity_url: SPACE,
      })
      expect(validateDeepLinkActivityUrl('https://content.test/lesson%20one', prefix)).toEqual({})
    }
  })

  test('accepts canonical prefix equivalents', () => {
    expect(
      validateDeepLinkActivityUrl(
        'HTTPS://CONTENT.TEST:443/course/a',
        'https://content.test/course/'
      )
    ).toEqual({})
    expect(
      validateDeepLinkActivityUrl(
        'https://content.test/course/a',
        'https://Content.Test:443/course/'
      )
    ).toEqual({})
  })

  test('reports a mismatch against the activity url', () => {
    expect(
      validateDeepLinkActivityUrl('https://content.test/coursework', 'https://content.test/course/')
    ).toEqual({ activity_url: DEEP_LINK_PREFIX_MESSAGES.mismatch })
  })

  test('attributes an invalid stored prefix to the activity code, not the url', () => {
    expect(
      validateDeepLinkActivityUrl(
        'https://content.test/course/a',
        'https://content.test/course?x=1'
      )
    ).toEqual({ activity_code_id: DEEP_LINK_PREFIX_MESSAGES.invalid })

    // A stored prefix with an inner literal space is invalid, not encoded.
    expect(
      validateDeepLinkActivityUrl(
        'https://content.test/course%20one/a',
        'https://content.test/course one/'
      )
    ).toEqual({ activity_code_id: DEEP_LINK_PREFIX_MESSAGES.invalid })

    // Both problems are reported on their own fields.
    expect(
      validateDeepLinkActivityUrl('https://content.test/course one/a', 'https://content.test/a b/')
    ).toEqual({ activity_url: SPACE, activity_code_id: DEEP_LINK_PREFIX_MESSAGES.invalid })

    // A whitespace-only prefix is not "no constraint", as in core.
    expect(validateDeepLinkActivityUrl('https://content.test/a', ' ')).toEqual({
      activity_code_id: DEEP_LINK_PREFIX_MESSAGES.invalid,
    })
  })
})
