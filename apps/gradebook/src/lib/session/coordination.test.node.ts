import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  coordinateAuthAction,
  expectedPrincipal,
  flagSessionChanged,
  notifySessionAction,
  renewSingleFlight,
  resetCoordinationForTests,
  sessionIsChanged,
  setExpectedPrincipal,
  startSessionNotifications,
  subscribeSessionChange,
} from './coordination'
import type { RenewalOutcome } from './renewal'

const renewed: RenewalOutcome = { status: 'renewed', principal: { domain: 'user', userId: 'u' } }

afterEach(() => {
  resetCoordinationForTests()
  vi.unstubAllGlobals()
})

describe('renewSingleFlight', () => {
  test('concurrent callers share one renewal', async () => {
    const work = vi.fn(async () => renewed)
    const results = await Promise.all([
      renewSingleFlight('user', work),
      renewSingleFlight('user', work),
      renewSingleFlight('user', work),
    ])
    expect(work).toHaveBeenCalledOnce()
    expect(results).toEqual([renewed, renewed, renewed])
  })

  test('domains are independent; a later call renews again', async () => {
    const work = vi.fn(async () => renewed)
    await Promise.all([renewSingleFlight('user', work), renewSingleFlight('admin', work)])
    await renewSingleFlight('user', work)
    expect(work).toHaveBeenCalledTimes(3)
  })
})

describe('coordinateAuthAction', () => {
  test('serialises actions in a domain even without Web Locks', async () => {
    vi.stubGlobal('navigator', {})
    const order: string[] = []
    const slow = coordinateAuthAction('user', async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('first')
    })
    const fast = coordinateAuthAction('user', async () => {
      order.push('second')
    })
    await Promise.all([slow, fast])
    expect(order).toEqual(['first', 'second'])
  })

  test('a failed action does not block the next one', async () => {
    vi.stubGlobal('navigator', {})
    await expect(
      coordinateAuthAction('user', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(await coordinateAuthAction('user', async () => 'ok')).toBe('ok')
  })

  test('uses a per-domain Web Lock when available', async () => {
    const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
    vi.stubGlobal('navigator', { locks: { request } })
    expect(await coordinateAuthAction('admin', async () => 'locked')).toBe('locked')
    expect(request).toHaveBeenCalledWith('modulus.auth.admin', expect.any(Function))
  })

  test('falls back to the in-tab queue when the lock manager is refused', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const work = vi.fn(async () => 'ran')
    expect(await coordinateAuthAction('user', work)).toBe('ran')
    expect(work).toHaveBeenCalledOnce()
  })

  test('never re-runs work that failed after the lock was granted', async () => {
    // Review R2: a timeout inside the callback has an unknown server outcome.
    const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
    vi.stubGlobal('navigator', { locks: { request } })
    const work = vi.fn(async () => {
      throw new DOMException('synthetic callback failure', 'TimeoutError')
    })
    await expect(coordinateAuthAction('user', work)).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(work).toHaveBeenCalledOnce()
  })

  test('falls back when reading navigator.locks itself throws', async () => {
    vi.stubGlobal('navigator', {
      get locks() {
        throw new Error('storage denied')
      },
    })
    expect(await coordinateAuthAction('user', async () => 'ran')).toBe('ran')
  })
})

describe('expected principal and change notices', () => {
  test('held in memory per domain; setting it clears a changed flag', () => {
    flagSessionChanged('user')
    setExpectedPrincipal('user', { domain: 'user', userId: 'u' })
    expect(expectedPrincipal('user')).toEqual({ domain: 'user', userId: 'u' })
    expect(expectedPrincipal('admin')).toBeNull()
    expect(sessionIsChanged('user')).toBe(false)
  })

  test('subscribers hear a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSessionChange('admin', listener)
    flagSessionChanged('admin')
    unsubscribe()
    flagSessionChanged('admin')
    expect(listener).toHaveBeenCalledOnce()
  })

  test('without BroadcastChannel, notices are skipped silently', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => {
      startSessionNotifications('user')
      notifySessionAction('user')
    }).not.toThrow()
  })

  test('a BroadcastChannel constructor that throws is tolerated', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new DOMException('denied', 'SecurityError')
        }
      }
    )
    expect(() => notifySessionAction('user')).not.toThrow()
  })

  test('a notice from another tab flags the domain as changed', () => {
    const channels: Array<{ onmessage: (() => void) | null }> = []
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: (() => void) | null = null
        constructor() {
          channels.push(this)
        }
        postMessage() {}
        close() {}
      }
    )
    startSessionNotifications('user')
    channels[0].onmessage?.()
    expect(sessionIsChanged('user')).toBe(true)
  })
})
