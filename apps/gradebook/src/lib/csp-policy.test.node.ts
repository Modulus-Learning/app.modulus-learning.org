import { describe, expect, test } from 'vitest'

import { cspHeaderFor, generateNonce, isStrictCspPath } from './csp-policy'

describe('csp policy', () => {
  test.each([
    '/sign-in',
    '/es/sign-up',
    '/dashboard/x',
    '/admin',
    '/start-activity/a/b',
    '/account',
  ])('%s takes the strict policy', (path) => {
    expect(isStrictCspPath(path)).toBe(true)
    expect(cspHeaderFor(path, 'n0nce')).toContain("'nonce-n0nce'")
  })

  test.each(['/', '/about', '/docs/intro', '/es'])('%s takes the relaxed policy', (path) => {
    expect(isStrictCspPath(path)).toBe(false)
    expect(cspHeaderFor(path, 'n0nce')).not.toContain('nonce-')
  })

  test('nonces are unique per call', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })
})
