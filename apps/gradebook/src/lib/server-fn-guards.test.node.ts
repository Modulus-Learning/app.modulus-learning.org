import { describe, expect, test } from 'vitest'

import { argumentList, requireSession, surfaceGate } from './server-fn-guards'

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

describe('argumentList', () => {
  const twoArgs = argumentList<[string, number]>(2)

  test('passes an argument array through', () => {
    expect(twoArgs(['en', 3])).toEqual(['en', 3])
  })

  test.each([
    ['a non-array', { locale: 'en' }],
    ['null', null],
    ['too many arguments', ['en', 3, 'extra']],
  ])('refuses %s with a 400', (_label, data) => {
    let thrown: unknown
    try {
      twoArgs(data)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(400)
  })
})
