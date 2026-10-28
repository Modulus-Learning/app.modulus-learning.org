import { describe, expect, test, vi } from 'vitest'

import { resolveGuardedSession, SessionRenewalUnavailable } from './route-guard'
import type { RenewalOutcome } from './renewal'

const principal = { domain: 'user' as const, userId: 'u1' }
const session = { user: { id: 'u1' } }

const run = (
  snapshots: Array<{ session: typeof session | null; renewable: boolean }>,
  outcome: RenewalOutcome,
  isServer = false
) => {
  const load = vi.fn(async () => snapshots.shift() ?? { session: null, renewable: false })
  const renew = vi.fn(async () => outcome)
  return {
    load,
    renew,
    decision: resolveGuardedSession({ domain: 'user', load, renew, isServer }),
  }
}

describe('resolveGuardedSession', () => {
  test('a valid session continues without renewing', async () => {
    const { decision, renew } = run([{ session, renewable: false }], { status: 'terminal' })
    expect(await decision).toEqual({ kind: 'session', session })
    expect(renew).not.toHaveBeenCalled()
  })

  test('no session and nothing to renew → anonymous', async () => {
    const { decision, renew } = run([{ session: null, renewable: false }], { status: 'terminal' })
    expect(await decision).toEqual({ kind: 'anonymous' })
    expect(renew).not.toHaveBeenCalled()
  })

  test('renewable on a server render → ssr-recovery, no renewal attempted', async () => {
    const { decision, renew } = run(
      [{ session: null, renewable: true }],
      { status: 'terminal' },
      true
    )
    expect(await decision).toEqual({ kind: 'ssr-recovery' })
    expect(renew).not.toHaveBeenCalled()
  })

  test('renewable in the browser, renewed → reloads and continues', async () => {
    const { decision, load } = run(
      [
        { session: null, renewable: true },
        { session, renewable: false },
      ],
      { status: 'renewed', principal }
    )
    expect(await decision).toEqual({ kind: 'session', session })
    expect(load).toHaveBeenCalledTimes(2)
  })

  test('renewable in the browser, terminal → anonymous', async () => {
    const { decision } = run([{ session: null, renewable: true }], { status: 'terminal' })
    expect(await decision).toEqual({ kind: 'anonymous' })
  })

  test('renewable in the browser, transient → SessionRenewalUnavailable, renewed once', async () => {
    const { decision, renew } = run([{ session: null, renewable: true }], { status: 'transient' })
    await expect(decision).rejects.toBeInstanceOf(SessionRenewalUnavailable)
    expect(renew).toHaveBeenCalledOnce()
  })
})
