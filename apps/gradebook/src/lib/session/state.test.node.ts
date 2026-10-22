import { describe, expect, test } from 'vitest'

import { classifySession } from './state'

const session = { user: { id: 'u1' }, abilities: [] }

describe('classifySession (verification-only)', () => {
  test('a verified access token is valid', () => {
    expect(
      classifySession({ status: 'valid', payload: session, expires_at_ms: 123 }, false)
    ).toEqual({ status: 'valid', session, expiresAtMs: 123 })
  })

  test('no access cookie: renewable with a refresh cookie, anonymous without', () => {
    expect(classifySession(null, true)).toEqual({ status: 'renewable' })
    expect(classifySession(null, false)).toEqual({ status: 'anonymous' })
  })

  test('an expired access token: renewable with a refresh cookie, anonymous without', () => {
    expect(classifySession({ status: 'expired' }, true)).toEqual({ status: 'renewable' })
    expect(classifySession({ status: 'expired' }, false)).toEqual({ status: 'anonymous' })
  })

  test.each(['invalid', 'bad_payload', 'missing'])(
    'a %s access token is never renewable, even with a refresh cookie',
    (status) => {
      expect(classifySession({ status }, true)).toEqual({ status: 'anonymous' })
    }
  )
})
