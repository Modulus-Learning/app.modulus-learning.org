import { describe, expect, test } from 'vitest'

import * as nextAdapter from './index'
import * as startAdapter from './start'

// Shared components import from `@/framework`, which resolves to a different
// implementation per host. A primitive missing from one side would compile in
// one host and fail at runtime in the other.
describe('framework adapter parity', () => {
  test('both implementations export the same runtime primitives', () => {
    const runtimeKeys = (module: object) => Object.keys(module).sort()
    expect(runtimeKeys(startAdapter)).toEqual(runtimeKeys(nextAdapter))
  })
})
