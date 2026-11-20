import { describe, expect, test } from 'vitest'

import { createRoute as createAdminRenew } from './$lng/_admin/admin/renew.route'
import { createRoute as createAdminLayout } from './$lng/_admin/route.route'
import { createRoute as createAgentLayout } from './agent/route.route'
import { createRoute as createAuthRenew } from './auth/renew.route'
import { createRoute as createLtiLayout } from './lti/route.route'

/**
 * Installation themes target `data-theme-context="public"`. The chromeless
 * integration screens (some shown inside Canvas) keep the Modulus defaults, so
 * their layouts declare a context installation rules never target.
 */
describe('theme contexts', () => {
  test.each([
    ['lti', createLtiLayout],
    ['agent', createAgentLayout],
    ['auth/renew', createAuthRenew],
  ])('%s is a chromeless integration screen', (_name, create) => {
    expect(create('/' as never).options.staticData).toEqual({
      chrome: 'chromeless',
      themeContext: 'integration',
    })
  })

  test('admin/renew inherits protected from the admin layout', () => {
    expect(createAdminRenew('/' as never).options.staticData).toEqual({ chrome: 'chromeless' })
    expect(createAdminLayout('/' as never).options.staticData).toEqual({
      themeContext: 'protected',
    })
  })
})
