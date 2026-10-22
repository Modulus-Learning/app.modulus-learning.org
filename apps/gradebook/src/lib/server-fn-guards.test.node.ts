import { describe, expect, test } from 'vitest'

import { requireSession, surfaceGate } from './server-fn-guards'

describe('surfaceGate', () => {
  test('all-in-one serves both surfaces', () => {
    expect(surfaceGate('all-in-one', 'frontend')).toBeNull()
    expect(surfaceGate('all-in-one', 'admin')).toBeNull()
  })

  test('a single-surface mode serves only its own surface', () => {
    expect(surfaceGate('frontend', 'frontend')).toBeNull()
    expect(surfaceGate('admin', 'admin')).toBeNull()
    expect(surfaceGate('frontend', 'admin')?.status).toBe(404)
    expect(surfaceGate('admin', 'frontend')?.status).toBe(404)
  })
})

describe('requireSession', () => {
  test('continues only for a valid session', () => {
    expect(requireSession({ status: 'valid', session: {}, expiresAtMs: 1 })).toBeNull()
    expect(requireSession({ status: 'renewable' })?.status).toBe(401)
    expect(requireSession({ status: 'anonymous' })?.status).toBe(401)
  })
})
