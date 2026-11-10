import { describe, expect, test, vi } from 'vitest'

import { createRequestScope, oncePerRequest, runInRequestScope } from './request-scope'

describe('oncePerRequest', () => {
  test('memoizes per request, including rejections', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('nope'))
    await runInRequestScope(createRequestScope(), async () => {
      await expect(oncePerRequest('k', factory)).rejects.toThrow('nope')
      await expect(oncePerRequest('k', factory)).rejects.toThrow('nope')
    })
    expect(factory).toHaveBeenCalledOnce()
  })

  test('does not share results across requests', async () => {
    const factory = vi.fn().mockResolvedValue('v')
    await runInRequestScope(createRequestScope(), () => oncePerRequest('k', factory))
    await runInRequestScope(createRequestScope(), () => oncePerRequest('k', factory))
    expect(factory).toHaveBeenCalledTimes(2)
  })

  test('runs unmemoized outside a request', async () => {
    const factory = vi.fn().mockResolvedValue('v')
    await oncePerRequest('k', factory)
    await oncePerRequest('k', factory)
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
