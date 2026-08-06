import { NextRequest } from 'next/server'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  initTokenVerifiers: vi.fn(),
  verifyAccessToken: vi.fn(),
}))

vi.mock('@modulus-learning/core/tokens', () => ({
  initTokenVerifiers: mocks.initTokenVerifiers,
}))
vi.mock('./config', () => ({
  getServerConfig: () => ({ publicServerUrl: 'https://gradebook.test' }),
}))
vi.mock('./lib/logger', () => ({ getLogger: () => ({}) }))
vi.mock('./lib/request-id', () => ({ getRequestId: mocks.getRequestId }))
vi.mock('./modules/admin/session/storage', () => ({ getAdminSession: vi.fn() }))
vi.mock('./modules/app/session/storage', () => ({ getUserSession: vi.fn() }))

import { getCoreAgentRequestContext } from './core-adapter'

describe('getCoreAgentRequestContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestId.mockResolvedValue('request-id')
    mocks.initTokenVerifiers.mockResolvedValue({
      agent: { verifyAccessToken: mocks.verifyAccessToken },
    })
  })

  test('constructs AgentAuth with the signed scope claim', async () => {
    const scopeId = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
    mocks.verifyAccessToken.mockResolvedValue({
      status: 'valid',
      expires_at_ms: Date.now() + 60_000,
      payload: {
        user: { id: 'user-id', full_name: 'Test Learner' },
        activity_id: 'activity-id',
        scope_id: scopeId,
        renew_after: 123,
      },
    })
    const request = new NextRequest('https://gradebook.test/routes/agent/activity', {
      headers: { Authorization: 'Bearer signed-token' },
    })

    const context = await getCoreAgentRequestContext(request)

    expect(context?.agentAuth).toMatchObject({
      user_id: 'user-id',
      activity_id: 'activity-id',
      scope_id: scopeId,
      renew_after: 123,
    })
  })
})
