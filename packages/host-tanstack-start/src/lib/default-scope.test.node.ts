import { DEFAULT_SCOPE_ID as CORE_DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { expect, test } from 'vitest'

import { DEFAULT_SCOPE_ID } from './default-scope'

test("the client-safe default scope id matches core's", () => {
  expect(DEFAULT_SCOPE_ID).toBe(CORE_DEFAULT_SCOPE_ID)
})
