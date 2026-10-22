import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { setProgressSchemas } from './schemas.js'

const ORIGIN = 'https://content.test'
const DUPLICATE_MESSAGE = 'increments_for_other_pages contains duplicate target URLs'

const parse = (targets: { url: string; factor: number }[]) =>
  setProgressSchemas.input.safeParse({
    progress_for_current_page: 0.5,
    increments_for_other_pages: targets,
  })

/** Asserts the request failed with exactly the duplicate-target issue. */
const assertDuplicate = (targets: { url: string; factor: number }[]) => {
  const result = parse(targets)
  assert.equal(result.success, false)
  assert.deepEqual(
    result.error?.issues.map(({ path, message }) => ({ path, message })),
    [{ path: ['increments_for_other_pages'], message: DUPLICATE_MESSAGE }]
  )
}

describe('setProgressSchemas.input duplicate targets', () => {
  it('rejects a repeated raw url', () => {
    assertDuplicate([
      { url: `${ORIGIN}/lesson`, factor: 0.5 },
      { url: `${ORIGIN}/lesson`, factor: 0.5 },
    ])
  })

  const equivalents: [label: string, spelling: string][] = [
    ['an explicit default port', `${ORIGIN}:443/lesson`],
    ['an uppercase scheme and host', 'HTTPS://CONTENT.TEST/lesson'],
    ['a dot segment', `${ORIGIN}/unit/../lesson`],
    ['an encoded dot segment', `${ORIGIN}/unit/%2e%2e/lesson`],
    ['a query', `${ORIGIN}/lesson?section=2`],
    ['a fragment', `${ORIGIN}/lesson#part-2`],
    ['an empty query', `${ORIGIN}/lesson?`],
    ['an empty fragment', `${ORIGIN}/lesson#`],
  ]

  for (const [label, spelling] of equivalents) {
    it(`rejects a canonical duplicate differing by ${label}`, () => {
      assertDuplicate([
        { url: `${ORIGIN}/lesson`, factor: 0.5 },
        { url: spelling, factor: 0.5 },
      ])
    })
  }

  it('rejects canonical duplicates that are not adjacent', () => {
    assertDuplicate([
      { url: `${ORIGIN}/lesson?section=1`, factor: 0.5 },
      { url: `${ORIGIN}/other`, factor: 0.5 },
      { url: `${ORIGIN}/lesson#part-2`, factor: 0.5 },
    ])
  })

  it('rejects a canonical duplicate whose factors differ', () => {
    // Factors are never chosen between or combined: the markup is wrong.
    assertDuplicate([
      { url: `${ORIGIN}/lesson`, factor: 0.25 },
      { url: `${ORIGIN}:443/lesson`, factor: 0.75 },
    ])
  })

  it('rejects an identical malformed url', () => {
    assertDuplicate([
      { url: 'not a url', factor: 0.5 },
      { url: 'not a url', factor: 0.5 },
    ])
  })

  it('accepts distinct malformed urls, which do not collide on a missing key', () => {
    // Each is refused by registration on its own, per target.
    const result = parse([
      { url: 'not a url', factor: 0.5 },
      { url: 'also not a url', factor: 0.5 },
      { url: `${ORIGIN}/lesson`, factor: 0.5 },
    ])
    assert.equal(result.success, true)
  })

  const distinctions: [label: string, a: string, b: string][] = [
    ['a non-root trailing slash', `${ORIGIN}/lesson`, `${ORIGIN}/lesson/`],
    ['a repeated slash', `${ORIGIN}/unit/lesson`, `${ORIGIN}/unit//lesson`],
    ['path case', `${ORIGIN}/lesson`, `${ORIGIN}/Lesson`],
    ['a non-default port', `${ORIGIN}/lesson`, `${ORIGIN}:8443/lesson`],
    ['an encoded query delimiter', `${ORIGIN}/lesson`, `${ORIGIN}/lesson%3F`],
  ]

  for (const [label, a, b] of distinctions) {
    it(`accepts targets that differ by ${label}`, () => {
      assert.equal(
        parse([
          { url: a, factor: 0.5 },
          { url: b, factor: 0.5 },
        ]).success,
        true
      )
    })
  }

  it('passes accepted targets through with their submitted spellings and factors', () => {
    const targets = [
      { url: 'HTTPS://CONTENT.TEST:443/lesson?section=2', factor: 1.5 },
      { url: 'not a url', factor: -1 },
    ]

    const result = parse(targets)

    assert.equal(result.success, true)
    assert.deepEqual(result.data?.increments_for_other_pages, targets)
  })

  it('does not echo submitted urls or component values in the issue', () => {
    const result = parse([
      { url: `${ORIGIN}/lesson?token=secret-token-value`, factor: 0.5 },
      { url: `${ORIGIN}/lesson#secret-fragment`, factor: 0.5 },
    ])

    const serialized = JSON.stringify(result.error?.issues)
    assert.doesNotMatch(serialized, /content\.test/)
    assert.doesNotMatch(serialized, /secret-token-value/)
    assert.doesNotMatch(serialized, /secret-fragment/)
  })
})
