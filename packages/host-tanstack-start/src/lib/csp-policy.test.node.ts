import { describe, expect, test } from 'vitest'

import { cspHeaderFor, generateNonce, isFramedPath, isStrictCspPath } from './csp-policy'

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

  // Review R4: pages an LMS frames carry no policy (Next excluded them too).
  test.each(['/lti/deep-link', '/lti/error', '/lti/launch/abc', '/agent/error', '/auth/renew'])(
    '%s is framed and takes no policy',
    (path) => {
      expect(isFramedPath(path)).toBe(true)
      expect(cspHeaderFor(path, 'n0nce')).toBeNull()
    }
  )

  test.each(['/routes/lti/launch', '/es/lti/error', '/auth/renewal', '/admin/renew', '/ltix'])(
    '%s is not a framed page',
    (path) => {
      expect(isFramedPath(path)).toBe(false)
      expect(cspHeaderFor(path, 'n0nce')).not.toBeNull()
    }
  )

  test('nonces are unique per call', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })
})
