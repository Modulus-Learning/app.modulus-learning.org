import { describe, expect, test, vi } from 'vitest'

import { BOUNDARY_HEADER } from './boundary'
import {
  isReusableBody,
  SessionChangedError,
  SessionEndedError,
  SessionRenewedRetryError,
  sendWithRenewal,
} from './replay'
import type { Principal } from './principal'
import type { RenewalOutcome } from './renewal'

const A: Principal = { domain: 'user', userId: 'user-a' }
const B: Principal = { domain: 'user', userId: 'user-b' }

const signalled = (signal: 'renew' | 'changed', status = signal === 'renew' ? 401 : 409) =>
  new Response(null, { status, headers: { [BOUNDARY_HEADER]: signal } })

const setup = (
  responses: Array<Response | Error>,
  outcome: RenewalOutcome = { status: 'renewed', principal: A },
  options: { reusable?: boolean; expected?: Principal | null } = {}
) => {
  const queue = [...responses]
  const send = vi.fn(async () => {
    const next = queue.shift()
    if (next == null) throw new Error('unexpected send')
    if (next instanceof Error) throw next
    return next
  })
  const renew = vi.fn(async () => outcome)
  const flagChanged = vi.fn()
  const run = () =>
    sendWithRenewal({
      send,
      renew,
      flagChanged,
      reusable: options.reusable ?? true,
      expected: options.expected === undefined ? A : options.expected,
    })
  return { run, send, renew, flagChanged }
}

describe('sendWithRenewal — replay only when the handler provably did not run', () => {
  test('renew signal → one renewal → exactly one replay', async () => {
    const { run, send, renew } = setup([signalled('renew'), new Response('ok')])
    const response = await run()
    expect(await response.text()).toBe('ok')
    expect(send).toHaveBeenCalledTimes(2)
    expect(renew).toHaveBeenCalledOnce()
  })

  test('an unsignalled response is returned untouched, no renewal', async () => {
    const { run, send, renew } = setup([new Response('ok')])
    expect(await (await run()).text()).toBe('ok')
    expect(send).toHaveBeenCalledOnce()
    expect(renew).not.toHaveBeenCalled()
  })

  test.each([400, 401, 403, 409, 422, 500, 502, 503])(
    'a handler error (%i, no signal) is never replayed',
    async (status) => {
      const { run, send, renew } = setup([new Response('handler failed', { status })])
      expect((await run()).status).toBe(status)
      expect(send).toHaveBeenCalledOnce()
      expect(renew).not.toHaveBeenCalled()
    }
  )

  test.each([
    ['network error', new TypeError('Failed to fetch')],
    ['timeout', Object.assign(new Error('timed out'), { name: 'TimeoutError' })],
    ['abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
  ])('a %s propagates and is never replayed', async (_label, error) => {
    const { run, send, renew } = setup([error])
    await expect(run()).rejects.toBe(error)
    expect(send).toHaveBeenCalledOnce()
    expect(renew).not.toHaveBeenCalled()
  })

  test('a network error on the replay propagates; no third attempt', async () => {
    const failure = new TypeError('Failed to fetch')
    const { run, send } = setup([signalled('renew'), failure])
    await expect(run()).rejects.toBe(failure)
    expect(send).toHaveBeenCalledTimes(2)
  })

  test('a second renew signal on the replay is not chased', async () => {
    const { run, send, renew } = setup([signalled('renew'), signalled('renew')])
    const response = await run()
    expect(response.status).toBe(401)
    expect(send).toHaveBeenCalledTimes(2)
    expect(renew).toHaveBeenCalledOnce()
  })

  test('changed signal → flagged, never replayed', async () => {
    const { run, send, renew, flagChanged } = setup([signalled('changed')])
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError)
    expect(flagChanged).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
    expect(renew).not.toHaveBeenCalled()
  })

  test('renewal as a different principal (account A form, account B cookies) → never replayed', async () => {
    const { run, send, flagChanged } = setup([signalled('renew')], {
      status: 'renewed',
      principal: B,
    })
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError)
    expect(flagChanged).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })

  test('no expected principal → never replayed', async () => {
    const { run, send } = setup([signalled('renew')], undefined, { expected: null })
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError)
    expect(send).toHaveBeenCalledOnce()
  })

  test.each(['terminal', 'transient'] as const)(
    'a %s renewal failure ends the call without replay',
    async (status) => {
      const { run, send } = setup([signalled('renew')], { status })
      const error = await run().catch((e) => e)
      expect(error).toBeInstanceOf(SessionEndedError)
      expect(error.outcome).toBe(status)
      expect(send).toHaveBeenCalledOnce()
    }
  )

  test('a non-re-sendable body surfaces a retry error instead of replaying', async () => {
    const { run, send, renew } = setup([signalled('renew')], undefined, { reusable: false })
    await expect(run()).rejects.toBeInstanceOf(SessionRenewedRetryError)
    expect(renew).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('isReusableBody', () => {
  test('FormData, strings and JSON bodies are re-sendable; streams and Requests are not', () => {
    expect(isReusableBody('/x', { body: new FormData() })).toBe(true)
    expect(isReusableBody('/x', { body: '{"a":1}' })).toBe(true)
    expect(isReusableBody('/x')).toBe(true)
    expect(isReusableBody('/x', { body: new ReadableStream() })).toBe(false)
    expect(isReusableBody(new Request('https://x.test/'))).toBe(false)
  })
})
