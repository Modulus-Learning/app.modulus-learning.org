// TODO: create real tests
import { describe, expect, test } from 'vitest'

import { getServerConfig } from '@/config/index.js'
import { delay, simpleHash, truncate } from './utils.general.js'

describe('general utils tests', () => {
  test('test getting env vars', () => {
    const publicServerURL = getServerConfig().publicServerUrl
    expect(publicServerURL).toBeDefined()
  })

  test('delay will wait n milliseconds', async () => {
    const start = Date.now()
    await delay(1000)
    const stop = Date.now()
    const elapsed = stop - start
    expect(elapsed >= 1000).toBeTruthy()
  })

  test('truncate for word boundary with suffix', async () => {
    const input = 'The quick brown fox jumped over the lazy dog'
    const output = truncate(input, 25, true, true)
    expect(output).toEqual('The quick brown fox...')
  })

  test('truncate for word boundary without suffix', async () => {
    const input = 'The quick brown fox jumped over the lazy dog'
    const output = truncate(input, 25, true, false)
    expect(output).toEqual('The quick brown fox')
  })

  test('simple hash of an input string', async () => {
    const hash1 = simpleHash('The quick brown fox jumped over the lazy dog')
    expect(hash1).toEqual('wb01rp')
    const hash2 = simpleHash('The quick brown fox jumped over the lazy dog and a bit more text...')
    expect(hash2).toEqual('1pb3xlo')
  })
})
