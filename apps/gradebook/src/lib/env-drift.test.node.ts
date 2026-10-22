import { describe, expect, test } from 'vitest'

import { findPublicEnvDrift } from './env-drift'

describe('findPublicEnvDrift', () => {
  test('reports a runtime value that differs from the baked one', () => {
    expect(findPublicEnvDrift({ VITE_SITE_NAME: 'A' }, { VITE_SITE_NAME: 'B' })).toEqual([
      'VITE_SITE_NAME',
    ])
  })

  test('ignores matching and unset runtime values', () => {
    expect(
      findPublicEnvDrift(
        { VITE_SITE_NAME: 'A', VITE_CSP_ENABLED: 'false' },
        { VITE_SITE_NAME: 'A' }
      )
    ).toEqual([])
  })
})
