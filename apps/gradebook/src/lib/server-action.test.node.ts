import { describe, expect, test, vi } from 'vitest'

import { actionEnvelope, followOutcome, readActionArgs } from './server-action'
import { runAction } from './server-action.server'
import { redirect } from './server-request'

vi.mock('@tanstack/react-start/server', () => ({
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestHeaders: vi.fn(),
  setCookie: vi.fn(),
}))

const status = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof Response ? error.status : 'not a Response'
  }
  return 'no error'
}

describe('form-action envelope', () => {
  test('round-trips positional arguments and a form', () => {
    const form = new FormData()
    form.set('name', 'Instructors')
    const args = readActionArgs(actionEnvelope([{ status: 'idle' }, form]))
    expect(args[0]).toEqual({ status: 'idle' })
    expect(args[1]).toBeInstanceOf(FormData)
    expect((args[1] as FormData).get('name')).toBe('Instructors')
    expect([...(args[1] as FormData).keys()]).toEqual(['name'])
  })

  test.each([
    ['not FormData', () => readActionArgs({ __args: '[]' })],
    ['missing arguments', () => readActionArgs(new FormData())],
    [
      'arguments that are not JSON',
      () => {
        const form = new FormData()
        form.set('__args', '[')
        return readActionArgs(form)
      },
    ],
    [
      'arguments that are not an array',
      () => {
        const form = new FormData()
        form.set('__args', '{}')
        return readActionArgs(form)
      },
    ],
  ])('refuses %s with a 400', (_label, run) => {
    expect(status(run)).toBe(400)
  })
})

describe('form-action outcomes', () => {
  test('a returned value is the result', async () => {
    expect(await runAction(async () => 'state')).toEqual({ kind: 'result', value: 'state' })
  })

  test('a thrown redirect() becomes a redirect outcome', async () => {
    expect(await runAction(async () => redirect('/admin/roles'))).toEqual({
      kind: 'redirect',
      url: '/admin/roles',
    })
  })

  test('any other error propagates', async () => {
    await expect(runAction(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  test('followOutcome resolves a result', async () => {
    expect(await followOutcome({ kind: 'result', value: 42 })).toBe(42)
  })
})
