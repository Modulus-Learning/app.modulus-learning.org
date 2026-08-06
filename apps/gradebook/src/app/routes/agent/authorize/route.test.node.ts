import { NextRequest } from 'next/server'

import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAuthCode: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreUserRequestContext: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreUserRequestContext: mocks.getCoreUserRequestContext,
}))

import { GET } from './route'

const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
const REDIRECT_URI = 'https://content.test/activity'

const makeRequest = (scopeId?: string): NextRequest => {
  const url = new URL('https://gradebook.test/routes/agent/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: REDIRECT_URI,
    redirect_uri: REDIRECT_URI,
    state: 'state-value',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
    ...(scopeId === undefined ? {} : { scope_id: scopeId }),
  }).toString()
  return new NextRequest(url)
}

describe('agent authorization route scope selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreUserRequestContext.mockResolvedValue({ requestId: 'request', userAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      agent: { auth: { createAuthCode: mocks.createAuthCode } },
    })
    mocks.createAuthCode.mockResolvedValue({ ok: true, data: { code: 'authorization-code' } })
  })

  test('normalizes a missing scope label to the default sentinel', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(307)
    expect(mocks.createAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope_id: DEFAULT_SCOPE_ID })
    )
  })

  test('passes a structurally valid client-selected scope to core', async () => {
    await GET(makeRequest(SCOPE_ID))

    expect(mocks.createAuthCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope_id: SCOPE_ID })
    )
  })

  test('rejects a malformed scope before creating an authorization code', async () => {
    const response = await GET(makeRequest('not-a-uuid'))

    expect(response.status).toBe(400)
    expect(mocks.createAuthCode).not.toHaveBeenCalled()
  })

  test('reports an unknown scope from core as invalid authorization input', async () => {
    mocks.createAuthCode.mockResolvedValue({
      ok: false,
      error: { code: 'ERR_VALIDATION', message: 'Unknown scope' },
    })

    const response = await GET(makeRequest(SCOPE_ID))

    expect(response.status).toBe(400)
  })
})
