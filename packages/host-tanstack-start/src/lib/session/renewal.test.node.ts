import { describe, expect, test, vi } from 'vitest'

import { type CookieSettings, sessionCookieWrites, type TokenPair } from './cookies'
import { principalOf } from './principal'
import { type RenewalDeps, renewSession } from './renewal'

type Session = { user: { id: string } }

const ACCESS: CookieSettings = {
  name: 'user_session',
  sameSite: 'none',
  httpOnly: true,
  secure: true,
}
const REFRESH: CookieSettings = {
  name: 'user_refresh',
  sameSite: 'none',
  httpOnly: true,
  secure: true,
}

const tokens: TokenPair = {
  access: { token: 'new-access', expiration_in_ms: 1_000_000 },
  refresh: { token: 'new-refresh', expiration_in_ms: 2_000_000 },
  remember_me: true,
}

const deps = (overrides: Partial<RenewalDeps<Session>>) => {
  const writeCookie = vi.fn()
  const refresh = vi.fn()
  return {
    writeCookie,
    refresh,
    deps: {
      state: { status: 'renewable' },
      refreshToken: 'refresh-token',
      principalOf: (session: Session) => principalOf('user', session),
      refresh,
      cookieWrites: (t: unknown) => sessionCookieWrites(t as TokenPair, ACCESS, REFRESH),
      writeCookie,
      ...overrides,
    } as RenewalDeps<Session>,
  }
}

describe('renewSession', () => {
  test('a still-valid session is left alone: no refresh, no cookie write', async () => {
    const {
      deps: d,
      refresh,
      writeCookie,
    } = deps({
      state: { status: 'valid', session: { user: { id: 'u1' } }, expiresAtMs: 1 },
    })
    expect(await renewSession(d)).toEqual({
      status: 'unchanged',
      principal: { domain: 'user', userId: 'u1' },
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(writeCookie).not.toHaveBeenCalled()
  })

  test('a renewable session is refreshed and writes exactly the new pair', async () => {
    const { deps: d, refresh, writeCookie } = deps({})
    refresh.mockResolvedValue({ ok: true, data: { tokens, session: { user: { id: 'u1' } } } })
    expect(await renewSession(d)).toEqual({
      status: 'renewed',
      principal: { domain: 'user', userId: 'u1' },
    })
    expect(refresh).toHaveBeenCalledWith('refresh-token')
    expect(writeCookie.mock.calls.map(([w]) => [w.name, w.value])).toEqual([
      ['user_session', 'new-access'],
      ['user_refresh', 'new-refresh'],
    ])
  })

  test.each([
    ['anonymous session', { state: { status: 'anonymous' } }],
    ['missing refresh cookie', { refreshToken: undefined }],
  ] as const)('%s → terminal, without refreshing', async (_label, override) => {
    const { deps: d, refresh, writeCookie } = deps(override as Partial<RenewalDeps<Session>>)
    expect(await renewSession(d)).toEqual({ status: 'terminal' })
    expect(refresh).not.toHaveBeenCalled()
    expect(writeCookie).not.toHaveBeenCalled()
  })

  test('a refused refresh is terminal and writes or deletes no cookie', async () => {
    const { deps: d, refresh, writeCookie } = deps({})
    refresh.mockResolvedValue({ ok: false, error: { code: 'ERR_UNAUTHORIZED' } })
    expect(await renewSession(d)).toEqual({ status: 'terminal' })
    expect(writeCookie).not.toHaveBeenCalled()
  })

  test.each([
    ['an unexpected core error', async () => ({ ok: false, error: { code: 'ERR_DATABASE' } })],
    [
      'a thrown error',
      async () => {
        throw new Error('db down')
      },
    ],
  ])('%s is transient and writes or deletes no cookie', async (_label, impl) => {
    const { deps: d, refresh, writeCookie } = deps({})
    refresh.mockImplementation(impl)
    expect(await renewSession(d)).toEqual({ status: 'transient' })
    expect(writeCookie).not.toHaveBeenCalled()
  })
})

describe('sessionCookieWrites', () => {
  test('matches the Next host attributes: path, SameSite, HttpOnly, Secure, +30s expiry', () => {
    const [access, refresh] = sessionCookieWrites(tokens, ACCESS, REFRESH)
    expect(access.options).toEqual({
      path: '/',
      sameSite: 'none',
      httpOnly: true,
      secure: true,
      expires: new Date(1_030_000),
    })
    expect(refresh.options.expires).toEqual(new Date(2_030_000))
  })

  test('a refresh cookie without remember-me is a session cookie', () => {
    const [, refresh] = sessionCookieWrites({ ...tokens, remember_me: false }, ACCESS, REFRESH)
    expect(refresh.options).not.toHaveProperty('expires')
  })
})
