import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isUsableRedirectUri,
  matchesRule,
  type NormalizedBaseUrl,
  normalizeRuleBaseUrl,
  parseAdmissibleUrl,
  toBaseUrl,
} from './url-policy.js'

/** Both entry points are the same decision, so every case asserts both. */
const assertAdmitted = (value: string): URL => {
  const url = parseAdmissibleUrl(value)
  assert.notEqual(url, null, `expected ${value} to parse as admissible`)
  assert.equal(isUsableRedirectUri(value), true, `expected ${value} to be a usable redirect uri`)
  return url as URL
}

const assertRejected = (value: string): void => {
  assert.equal(parseAdmissibleUrl(value), null, `expected ${value} to be rejected`)
  assert.equal(
    isUsableRedirectUri(value),
    false,
    `expected ${value} to be an unusable redirect uri`
  )
}

const rule = (origin: string, path_prefix = '/'): NormalizedBaseUrl => ({ origin, path_prefix })

describe('parseAdmissibleUrl / isUsableRedirectUri', () => {
  it('accepts an https url with a path, query and fragment', () => {
    const url = assertAdmitted('https://content.example/course/calculus?page=2#top')
    assert.equal(url.origin, 'https://content.example')
    assert.equal(url.pathname, '/course/calculus')
  })

  it('accepts http on localhost and 127.0.0.1, for local development', () => {
    assert.equal(assertAdmitted('http://localhost:3000/x').hostname, 'localhost')
    assert.equal(assertAdmitted('http://127.0.0.1/x').hostname, '127.0.0.1')
  })

  it('rejects insecure http on a remote host', () => {
    assertRejected('http://content.example/x')
  })

  it('rejects a bare-userinfo host disguise', () => {
    // The apparent host is only a username; the request resolves to
    // evil.example. Catching this is the half of the open redirect this
    // feature actually closes.
    assertRejected('https://modulus.example@evil.example/')
  })

  it('rejects a username and password host disguise', () => {
    assertRejected('https://user:pass@evil.example/')
  })

  it('rejects javascript: and data: urls', () => {
    // Both parse cleanly under `new URL()` and pass Zod's `z.url()`, so the
    // scheme check here is the real filter, not a formality.
    assert.doesNotThrow(() => new URL('javascript:alert(1)'))
    assert.doesNotThrow(() => new URL('data:text/html,x'))

    assertRejected('javascript:alert(1)')
    assertRejected('data:text/html,x')
  })

  it('rejects a relative path and a non-url', () => {
    assertRejected('/relative/path')
    assertRejected('not-a-url')
  })

  it('rejects http on ipv6 loopback, matching the host form validator', () => {
    // A characterization guard, not a defect. The gradebook's form validator
    // accepts only `localhost` and `127.0.0.1` over HTTP, so admitting `[::1]`
    // in core would create a URL the form rejects before core ever sees it.
    // Change both or neither.
    assertRejected('http://[::1]/x')
  })
})

describe('matchesRule', () => {
  it('admits every path on the origin for a / rule', () => {
    const origin = rule('https://content.example')

    for (const candidate of [
      'https://content.example/',
      'https://content.example/course/calculus',
      'https://content.example/deeply/nested/page.html',
    ]) {
      assert.equal(matchesRule(new URL(candidate), origin), true, candidate)
    }
  })

  it('admits its own path and a descendant for a subtree rule', () => {
    const subtree = rule('https://content.example', '/course/calculus')

    assert.equal(matchesRule(new URL('https://content.example/course/calculus'), subtree), true)
    assert.equal(matchesRule(new URL('https://content.example/course/calculus/'), subtree), true)
    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus/week-1'), subtree),
      true
    )
  })

  it('rejects a sibling path that merely begins with the rule path', () => {
    // The path-boundary defect: a bare `startsWith` would admit this.
    const subtree = rule('https://content.example', '/course/calculus')

    assert.equal(matchesRule(new URL('https://content.example/course/calculus-2'), subtree), false)
    assert.equal(matchesRule(new URL('https://content.example/coursework'), subtree), false)
  })

  it('rejects a host that merely begins with the rule host', () => {
    // The origin-prefix defect: a `startsWith` on the origin would admit this.
    const trusted = rule('https://trusted.example')

    assert.equal(matchesRule(new URL('https://trusted.example.evil/'), trusted), false)
    assert.equal(
      matchesRule(new URL('https://trusted.example.evil/course/calculus'), trusted),
      false
    )
  })

  it('rejects an implicit subdomain', () => {
    assert.equal(
      matchesRule(new URL('https://www.example.edu/x'), rule('https://example.edu')),
      false
    )
    assert.equal(
      matchesRule(new URL('https://example.edu/x'), rule('https://www.example.edu')),
      false
    )
  })

  it('rejects a different scheme and a different explicit port', () => {
    const secure = rule('https://content.example')

    assert.equal(matchesRule(new URL('http://content.example/x'), secure), false)
    assert.equal(matchesRule(new URL('https://content.example:8443/x'), secure), false)
    assert.equal(
      matchesRule(new URL('https://content.example/x'), rule('https://content.example:8443')),
      false
    )
  })

  it('compares the host case-insensitively and the path case-sensitively', () => {
    const subtree = rule('https://content.example', '/Course/Calculus')

    assert.equal(matchesRule(new URL('https://CONTENT.EXAMPLE/Course/Calculus'), subtree), true)
    assert.equal(matchesRule(new URL('https://content.example/course/calculus'), subtree), false)
  })

  it('ignores the query string and fragment', () => {
    const subtree = rule('https://content.example', '/course/calculus')

    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus?page=2#top'), subtree),
      true
    )
    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus-2?page=2'), subtree),
      false
    )
  })

  it('is unaffected by a trailing slash on the stored rule path', () => {
    const withSlash = rule('https://content.example', '/course/calculus/')

    assert.equal(matchesRule(new URL('https://content.example/course/calculus'), withSlash), true)
    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus-2'), withSlash),
      false
    )
  })

  it('compares dot segments after normalization', () => {
    const subtree = rule('https://content.example', '/course/calculus')

    // `URL` resolves this to /course/calculus-2, which the rule must not admit.
    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus/../calculus-2'), subtree),
      false
    )
    assert.equal(
      matchesRule(new URL('https://content.example/course/calculus/../calculus/week-1'), subtree),
      true
    )
  })
})

describe('normalizeRuleBaseUrl / toBaseUrl', () => {
  const normalized = (value: string): NormalizedBaseUrl => {
    const result = normalizeRuleBaseUrl(value)
    assert.equal(result.ok, true, `expected ${value} to normalize`)
    return (result as { ok: true; rule: NormalizedBaseUrl }).rule
  }

  it('collapses the bare origin, its trailing slash, and its default port', () => {
    const expected = { origin: 'https://example.edu', path_prefix: '/' }

    assert.deepEqual(normalized('https://example.edu'), expected)
    assert.deepEqual(normalized('https://example.edu/'), expected)
    assert.deepEqual(normalized('https://example.edu:443/'), expected)
  })

  it('collapses a subtree with and without a trailing slash', () => {
    // The round trip that makes a normalizing collision ordinary rather than
    // exceptional, and so has to be reported rather than raised.
    const expected = { origin: 'https://example.edu', path_prefix: '/course/calculus' }

    assert.deepEqual(normalized('https://example.edu/course/calculus'), expected)
    assert.deepEqual(normalized('https://example.edu/course/calculus/'), expected)
    assert.deepEqual(normalized('https://example.edu/course/calculus?page=2#top'), expected)
  })

  it('lowercases the host and keeps the path case', () => {
    assert.deepEqual(normalized('https://EXAMPLE.edu/Course/Calculus'), {
      origin: 'https://example.edu',
      path_prefix: '/Course/Calculus',
    })
  })

  it('normalizes a non-default port and an http loopback origin', () => {
    assert.deepEqual(normalized('https://example.edu:8443/x'), {
      origin: 'https://example.edu:8443',
      path_prefix: '/x',
    })
    assert.deepEqual(normalized('http://localhost:3000'), {
      origin: 'http://localhost:3000',
      path_prefix: '/',
    })
  })

  it('reports malformed_url for anything the admission syntax rejects', () => {
    for (const value of [
      'http://content.example/x',
      'https://user:pass@evil.example/',
      'javascript:alert(1)',
      '/relative/path',
      'not-a-url',
    ]) {
      assert.deepEqual(normalizeRuleBaseUrl(value), { ok: false, reason: 'malformed_url' }, value)
    }
  })

  it('renders a / rule as the bare origin and a subtree rule with its path', () => {
    assert.equal(
      toBaseUrl({ origin: 'https://example.edu', path_prefix: '/' }),
      'https://example.edu'
    )
    assert.equal(
      toBaseUrl({ origin: 'https://example.edu', path_prefix: '/course/calculus' }),
      'https://example.edu/course/calculus'
    )
  })

  it('round-trips a normalized pair through toBaseUrl', () => {
    for (const value of [
      'https://example.edu',
      'https://example.edu/course/calculus',
      'https://example.edu:8443/x',
      'http://localhost:3000/x',
    ]) {
      const pair = normalized(value)
      assert.deepEqual(normalized(toBaseUrl(pair)), pair, value)
    }
  })
})
