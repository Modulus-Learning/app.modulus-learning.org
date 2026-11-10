import { describe, expect, test } from 'vitest'

import { readUrlLines } from './@types/validate-urls'
import {
  mapActivityCodeFailure,
  readRejectedUrls,
  readValidationIssues,
  rejectedUrlsMessage,
} from './rejected-urls'

/** The phrases that send an instructor to an administrator. */
const ACCESS_REQUEST = /administrator|request access/i

describe('readRejectedUrls', () => {
  test('reads each url with its reason', () => {
    expect(
      readRejectedUrls({
        rejected: [
          { url: 'https://a.test/one', reason: 'activity_url_not_allowed' },
          { url: 'https://b.test/two', reason: 'url_too_long' },
          { url: 'ftp://c.test/three', reason: 'malformed_url' },
        ],
      })
    ).toEqual([
      { url: 'https://a.test/one', reason: 'activity_url_not_allowed' },
      { url: 'https://b.test/two', reason: 'url_too_long' },
      { url: 'ftp://c.test/three', reason: 'malformed_url' },
    ])
  })

  test('keeps the url but guesses no reason when it is missing or unrecognized', () => {
    expect(
      readRejectedUrls({
        rejected: [
          { url: 'https://a.test/one' },
          { url: 'https://b.test/two', reason: 'some_future_reason' },
          { url: 'https://c.test/three', reason: 42 },
        ],
      })
    ).toEqual([
      { url: 'https://a.test/one', reason: null },
      { url: 'https://b.test/two', reason: null },
      { url: 'https://c.test/three', reason: null },
    ])
  })

  test('returns nothing for a shape it does not recognize', () => {
    expect(readRejectedUrls(undefined)).toEqual([])
    expect(readRejectedUrls({})).toEqual([])
    expect(readRejectedUrls({ rejected: 'not-an-array' })).toEqual([])
    expect(
      readRejectedUrls({
        rejected: [null, 42, { reason: 'malformed_url' }, { url: 7 }, { url: '' }],
      })
    ).toEqual([])
  })

  test("keeps core's order, which is not the submission order", () => {
    // Core registers sorted canonical keys and expands each back to its
    // submitted spellings, so raw spellings need not arrive sorted either.
    expect(
      readRejectedUrls({
        rejected: [
          { url: 'https://z.test/a' },
          { url: 'HTTPS://Z.TEST/a' },
          { url: 'https://a.test/b' },
        ],
      }).map(({ url }) => url)
    ).toEqual(['https://z.test/a', 'HTTPS://Z.TEST/a', 'https://a.test/b'])
  })
})

describe('rejectedUrlsMessage', () => {
  test('names a single deep-link url with policy guidance', () => {
    expect(
      rejectedUrlsMessage([{ url: 'https://a.test/one', reason: 'activity_url_not_allowed' }])
    ).toBe(
      'https://a.test/one. This Modulus site does not admit this new activity URL. Contact a Modulus administrator to request access.'
    )
  })

  test('explains a malformed url with syntax guidance, not an access request', () => {
    const message = rejectedUrlsMessage([
      { url: 'https://user:pw@a.test/one', reason: 'malformed_url' },
    ])

    expect(message).toContain('https://user:pw@a.test/one')
    expect(message).toContain('require HTTPS, or HTTP for localhost or 127.0.0.1')
    expect(message).toContain('cannot contain credentials')
    expect(message).not.toMatch(ACCESS_REQUEST)
  })

  test('explains an overlong url with the storage limit, not an access request', () => {
    const message = rejectedUrlsMessage([{ url: 'https://a.test/long', reason: 'url_too_long' }])

    expect(message).toContain('255-character storage limit')
    expect(message).toContain('Supply a shorter activity URL')
    expect(message).not.toMatch(ACCESS_REQUEST)
  })

  test('gives a neutral failure for a missing or unrecognized reason', () => {
    const message = rejectedUrlsMessage([{ url: 'https://a.test/one', reason: null }])

    expect(message).toBe('https://a.test/one. Modulus could not register this activity URL.')
    expect(message).not.toMatch(ACCESS_REQUEST)
  })

  test('presents a mixed batch in physical line order, with guidance per reason', () => {
    const submitted = readUrlLines(
      [
        'https://z.test/denied', // 1
        '', // 2
        'ftp://a.test/malformed', // 3
        'HTTPS://Z.TEST/denied', // 4
        'https://ok.test/fine', // 5
        'https://z.test/denied', // 6
        'https://m.test/unknown', // 7
      ].join('\n')
    )

    // Core's order: sorted canonical keys, expanded to submitted spellings.
    const message = rejectedUrlsMessage(
      [
        { url: 'ftp://a.test/malformed', reason: 'malformed_url' },
        { url: 'https://m.test/unknown', reason: null },
        { url: 'https://z.test/denied', reason: 'activity_url_not_allowed' },
        { url: 'HTTPS://Z.TEST/denied', reason: 'activity_url_not_allowed' },
      ],
      submitted
    )

    expect(message).toBe(
      [
        'Lines 1, 4, 6: https://z.test/denied, HTTPS://Z.TEST/denied. This Modulus site does not admit these new activity URLs. Contact a Modulus administrator to request access.',
        'Line 3: ftp://a.test/malformed. Correct this URL: new activities require HTTPS, or HTTP for localhost or 127.0.0.1, and cannot contain credentials.',
        'Line 7: https://m.test/unknown. Modulus could not register this activity URL.',
      ].join(' ')
    )
  })

  test('discloses no rule and no url the instructor did not submit', () => {
    const message = rejectedUrlsMessage([
      { url: 'https://elsewhere.test/one', reason: 'activity_url_not_allowed' },
    ])

    expect(message).not.toContain('https://approved.test')
    expect(message).not.toMatch(/allowlist|allowed base url|rule for|administrator [a-z]+@/i)
  })
})

describe('readValidationIssues', () => {
  test('reads path and message, dropping anything else', () => {
    expect(
      readValidationIssues({
        issues: [
          { path: ['urls', 2], message: 'A.', code: 'custom', input: 'secret' },
          { path: ['url_prefix'], message: 'B.' },
          { path: 'urls', message: 'bad path' },
          { path: [{}], message: 'bad segment' },
          { path: ['urls', 0] },
          null,
        ],
      })
    ).toEqual([
      { path: ['urls', 2], message: 'A.' },
      { path: ['url_prefix'], message: 'B.' },
    ])
    expect(readValidationIssues(undefined)).toEqual([])
    expect(readValidationIssues({ issues: {} })).toEqual([])
  })
})

describe('mapActivityCodeFailure', () => {
  const submitted = readUrlLines('\nhttps://a.test/one\n\nhttps://b.test/two?x')

  test('translates command indexes to physical lines for validation issues', () => {
    expect(
      mapActivityCodeFailure(
        {
          code: 'ERR_VALIDATION',
          details: {
            issues: [
              { path: ['urls', 1], message: 'Components.' },
              { path: ['url_prefix'], message: 'Prefix.' },
            ],
          },
        },
        submitted
      )
    ).toEqual({
      type: 'fields',
      errors: { urls: ['Line 4: Components.'], url_prefix: ['Prefix.'] },
      message: 'Invalid URLs.',
    })
  })

  test('maps a prefix-only validation failure to the prefix field', () => {
    expect(
      mapActivityCodeFailure(
        { code: 'ERR_VALIDATION', details: { issues: [{ path: ['url_prefix'], message: 'P.' }] } },
        submitted
      )
    ).toEqual({ type: 'fields', errors: { url_prefix: ['P.'] }, message: 'Invalid URL prefix.' })
  })

  test('leaves validation failures on other fields to the generic path', () => {
    expect(
      mapActivityCodeFailure(
        { code: 'ERR_VALIDATION', details: { issues: [{ path: ['code'], message: 'C.' }] } },
        submitted
      )
    ).toBeNull()
  })

  test('reports an unusable denial payload as unreadable', () => {
    expect(
      mapActivityCodeFailure({ code: 'ERR_ACTIVITY_URL_NOT_ALLOWED', details: {} }, submitted)
    ).toEqual({ type: 'unreadable-denial' })
  })

  test('ignores unrelated codes', () => {
    expect(mapActivityCodeFailure({ code: 'ERR_DATABASE' }, submitted)).toBeNull()
  })
})
