import { describe, expect, test } from 'vitest'

import { readEnvelope } from './action-bridge'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

const status = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof Response ? error.status : 'not a Response'
  }
  return 'no error'
}

describe('action bridge envelope', () => {
  test('reads a well-formed envelope', () => {
    expect(
      readEnvelope(form({ __key: 'app/x', __export: 'run', __args: '["en",{"a":1}]', field: 'v' }))
    ).toEqual({ key: 'app/x', name: 'run', args: ['en', { a: 1 }] })
  })

  test.each([
    ['not FormData', () => readEnvelope({ __key: 'app/x' })],
    ['a missing key', () => readEnvelope(form({ __export: 'run', __args: '[]' }))],
    ['a missing export', () => readEnvelope(form({ __key: 'app/x', __args: '[]' }))],
    ['missing arguments', () => readEnvelope(form({ __key: 'app/x', __export: 'run' }))],
    [
      'arguments that are not JSON',
      () => readEnvelope(form({ __key: 'a', __export: 'b', __args: '[' })),
    ],
    [
      'arguments that are not an array',
      () => readEnvelope(form({ __key: 'a', __export: 'b', __args: '{}' })),
    ],
  ])('refuses %s with a 400', (_label, run) => {
    expect(status(run)).toBe(400)
  })
})
