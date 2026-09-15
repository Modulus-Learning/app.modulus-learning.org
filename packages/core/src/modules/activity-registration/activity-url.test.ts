import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  matchesActivityUrlPrefix,
  normalizeActivityUrl,
  validateInstructorActivityUrl,
} from './activity-url.js'
import { parseAdmissibleUrl } from './url-policy.js'

describe('normalizeActivityUrl', () => {
  it('applies the agreed transformations', () => {
    const cases: [input: string, canonical: string][] = [
      // Scheme and host case; default ports.
      ['HTTPS://CONTENT.TEST:443/lesson', 'https://content.test/lesson'],
      ['http://localhost:80/lesson', 'http://localhost/lesson'],
      // Root completion.
      ['https://content.test', 'https://content.test/'],
      // Literal and parser-recognised encoded dot segments.
      ['https://content.test/a/../lesson', 'https://content.test/lesson'],
      ['https://content.test/a/./lesson', 'https://content.test/a/lesson'],
      ['https://content.test/a/%2e%2e/lesson', 'https://content.test/lesson'],
      ['https://content.test/a/%2E%2E/lesson', 'https://content.test/lesson'],
      // Unicode host and path.
      ['https://bücher.example/', 'https://xn--bcher-kva.example/'],
      ['https://content.test/é', 'https://content.test/%C3%A9'],
      // Query and fragment, including empty components.
      ['https://content.test/lesson?foo=bar&blah=17#scroll-to-here', 'https://content.test/lesson'],
      ['https://content.test/lesson?foo=bar', 'https://content.test/lesson'],
      ['https://content.test/lesson#scroll-to-here', 'https://content.test/lesson'],
      ['https://content.test/lesson?', 'https://content.test/lesson'],
      ['https://content.test/lesson#', 'https://content.test/lesson'],
      ['https://content.test/lesson?#', 'https://content.test/lesson'],
      ['https://content.test/?x=1', 'https://content.test/'],
      ['https://content.test?x=1', 'https://content.test/'],
      // Parser repairs this module inherits rather than introduces.
      ['https:content.test/lesson', 'https://content.test/lesson'],
      ['https://content.test\\a\\lesson', 'https://content.test/a/lesson'],
      ['http://127.1/', 'http://127.0.0.1/'],
      ['http://0x7f.0.0.1/', 'http://127.0.0.1/'],
      ['  https://content.test/lesson  ', 'https://content.test/lesson'],
    ]

    for (const [input, canonical] of cases) {
      assert.equal(normalizeActivityUrl(input), canonical, input)
    }
  })

  it('leaves already-significant spellings unchanged', () => {
    for (const value of [
      'https://content.test:8443/lesson',
      'https://content.test/a%3Fb',
      'https://content.test/a%23b',
      'https://content.test/%zz',
      'https://content.test/a%2Fb',
      'https://content.test./lesson',
    ]) {
      assert.equal(normalizeActivityUrl(value), value, value)
    }
  })

  it('preserves the distinctions that can identify different resources', () => {
    const distinct: [string, string][] = [
      ['https://content.test/Lesson', 'https://content.test/lesson'],
      ['https://content.test/lesson', 'https://content.test/lesson/'],
      ['https://content.test/a//b', 'https://content.test/a/b'],
      ['https://content.test/lesson', 'https://content.test/lesson/index.html'],
      ['http://localhost/lesson', 'https://localhost/lesson'],
      ['https://content.test/lesson', 'https://www.content.test/lesson'],
      ['https://content.test/lesson', 'https://content.test./lesson'],
      ['https://content.test/a%2Fb', 'https://content.test/a/b'],
      ['https://content.test:8443/lesson', 'https://content.test/lesson'],
      ['https://content.test/%7euser', 'https://content.test/%7Euser'],
      ['https://content.test/%7euser', 'https://content.test/~user'],
      ['https://content.test/%7Euser', 'https://content.test/~user'],
    ]

    for (const [left, right] of distinct) {
      const a = normalizeActivityUrl(left)
      const b = normalizeActivityUrl(right)
      assert.notEqual(a, null, left)
      assert.notEqual(b, null, right)
      assert.notEqual(a, b, `${left} and ${right} must stay distinct`)
    }
  })

  it('is idempotent', () => {
    for (const value of [
      'HTTPS://CONTENT.TEST:443/a/../Lesson/?x=1#top',
      'https://bücher.example/é',
      'https:content.test\\a//b/',
      'https://content.test/%7euser',
      'https://user:pass@content.test/lesson',
      'javascript:alert(1)?x#y',
      'data:text/html,x #frag',
    ]) {
      const once = normalizeActivityUrl(value)
      assert.notEqual(once, null, value)
      assert.equal(normalizeActivityUrl(once as string), once, value)
    }
  })

  it('returns null when the platform parser fails', () => {
    for (const value of [
      '',
      'not-a-url',
      '/relative/path',
      'content.test/lesson',
      'https://',
      'https://exa mple.test/',
      'http://[::1/',
    ]) {
      assert.equal(normalizeActivityUrl(value), null, JSON.stringify(value))
    }
  })

  it('does not grant admission to a credentialed or otherwise inadmissible url', () => {
    // Normalization is a lookup key, not an admission decision. Credentials are
    // kept rather than stripped, so the result still fails admission syntax.
    const cases: [input: string, canonical: string][] = [
      ['https://user:pass@content.test/lesson?x=1', 'https://user:pass@content.test/lesson'],
      ['https://modulus.test@evil.test/', 'https://modulus.test@evil.test/'],
      ['http://content.test/lesson', 'http://content.test/lesson'],
      ['javascript:alert(1)', 'javascript:alert(1)'],
      ['data:text/html,x', 'data:text/html,x'],
    ]

    for (const [input, canonical] of cases) {
      assert.equal(normalizeActivityUrl(input), canonical, input)
      assert.equal(parseAdmissibleUrl(canonical), null, canonical)
    }
  })
})

describe('validateInstructorActivityUrl', () => {
  it('accepts a component-free url and returns its canonical string', () => {
    const cases: [input: string, canonical: string][] = [
      ['https://content.test/lesson', 'https://content.test/lesson'],
      ['HTTPS://CONTENT.TEST:443/lesson', 'https://content.test/lesson'],
      ['https://content.test', 'https://content.test/'],
      ['https://content.test/lesson/', 'https://content.test/lesson/'],
      ['https://bücher.example/é', 'https://xn--bcher-kva.example/%C3%A9'],
      ['https:content.test/lesson', 'https://content.test/lesson'],
    ]

    for (const [input, canonical] of cases) {
      assert.deepEqual(validateInstructorActivityUrl(input), { ok: true, url: canonical }, input)
    }
  })

  it('accepts encoded delimiters as ordinary path characters', () => {
    for (const value of [
      'https://content.test/a%3Fb',
      'https://content.test/a%23b',
      'https://content.test/a%3fb%23c',
    ]) {
      assert.deepEqual(validateInstructorActivityUrl(value), { ok: true, url: value }, value)
    }
  })

  it('rejects query and fragment presence, including empty components', () => {
    for (const value of [
      'https://content.test/lesson?foo=bar',
      'https://content.test/lesson#top',
      'https://content.test/lesson?foo=bar#top',
      'https://content.test/lesson?',
      'https://content.test/lesson#',
      'https://content.test/lesson?#',
      'https://content.test?x=1',
      'https://content.test#',
      'HTTPS://CONTENT.TEST:443/lesson?',
      'https://content.test/a%3Fb?',
    ]) {
      assert.deepEqual(
        validateInstructorActivityUrl(value),
        { ok: false, reason: 'unsupported_url_components' },
        value
      )
    }
  })

  it('reports malformed_url when the platform parser fails', () => {
    for (const value of ['', 'not-a-url', '/relative/path', 'https://', 'https://exa mple.test/']) {
      assert.deepEqual(
        validateInstructorActivityUrl(value),
        { ok: false, reason: 'malformed_url' },
        JSON.stringify(value)
      )
    }
  })

  it('checks parsing and components only, not admission', () => {
    // Scheme and credential restrictions belong to registration, so that an
    // existing activity that fails today's admission syntax stays usable.
    for (const value of [
      'https://user:pass@content.test/lesson',
      'http://content.test/lesson',
      'javascript:alert(1)',
    ]) {
      const result = validateInstructorActivityUrl(value)
      assert.deepEqual(result, { ok: true, url: value }, value)
      assert.equal(parseAdmissibleUrl(value), null, value)
    }
  })

  it('agrees with normalizeActivityUrl on accepted input and does not mutate it', () => {
    const value = 'HTTPS://CONTENT.TEST:443/a/../lesson'
    const result = validateInstructorActivityUrl(value)

    assert.equal(value, 'HTTPS://CONTENT.TEST:443/a/../lesson')
    assert.deepEqual(result, { ok: true, url: normalizeActivityUrl(value) })
  })
})

describe('matchesActivityUrlPrefix', () => {
  it('matches spelling variants of the same prefix', () => {
    const cases: [value: string, prefix: string][] = [
      // Origin-only completion on both sides.
      ['https://content.test', 'https://content.test'],
      ['https://content.test/course/lesson', 'https://content.test'],
      ['https://content.test/course/lesson', 'https://content.test/'],
      // Default port and case normalization on either side.
      ['https://content.test/course/lesson', 'HTTPS://CONTENT.TEST:443/course'],
      ['HTTPS://Content.Test:443/course/lesson', 'https://content.test/course'],
      // Dot segments are resolved before comparison.
      ['https://content.test/other/../course/lesson', 'https://content.test/course'],
      // A preserved trailing slash matches its descendants.
      ['https://content.test/course/lesson', 'https://content.test/course/'],
      ['https://content.test/course/', 'https://content.test/course/'],
    ]

    for (const [value, prefix] of cases) {
      assert.equal(matchesActivityUrlPrefix(value, prefix), true, `${value} under ${prefix}`)
    }
  })

  it('retains plain string-prefix semantics', () => {
    // Not a path-segment match: `/course` still matches `/coursework`, and an
    // authored trailing slash is what excludes it.
    assert.equal(
      matchesActivityUrlPrefix('https://content.test/coursework', 'https://content.test/course'),
      true
    )
    assert.equal(
      matchesActivityUrlPrefix('https://content.test/coursework', 'https://content.test/course/'),
      false
    )
    assert.equal(
      matchesActivityUrlPrefix('https://content.test/course', 'https://content.test/course/'),
      false
    )
  })

  it('keeps path case, scheme, port and host significant', () => {
    const cases: [value: string, prefix: string][] = [
      ['https://content.test/Course/lesson', 'https://content.test/course'],
      ['http://localhost/course', 'https://localhost/course'],
      ['https://content.test:8443/course', 'https://content.test/course'],
      ['https://www.content.test/course', 'https://content.test/course'],
      ['https://content.test.evil/course', 'https://content.test'],
    ]

    for (const [value, prefix] of cases) {
      assert.equal(matchesActivityUrlPrefix(value, prefix), false, `${value} under ${prefix}`)
    }
  })

  it('returns false when either side is malformed or carries components', () => {
    const cases: [value: string, prefix: string][] = [
      ['not-a-url', 'https://content.test'],
      ['https://content.test/course', 'not-a-url'],
      ['https://content.test/course', ''],
      ['', 'https://content.test'],
      ['https://content.test/course?x=1', 'https://content.test/course'],
      ['https://content.test/course#', 'https://content.test/course'],
      ['https://content.test/course/lesson', 'https://content.test/course?'],
      ['https://content.test/course/lesson', 'https://content.test/course#top'],
    ]

    for (const [value, prefix] of cases) {
      assert.equal(
        matchesActivityUrlPrefix(value, prefix),
        false,
        `${JSON.stringify(value)} under ${JSON.stringify(prefix)}`
      )
    }
  })
})
