import type { TokenVerifiers } from '@modulus-learning/core/tokens'
import { describe, expect, test, vi } from 'vitest'

import { toAdminRequestContext, toAgentRequestContext, toUserRequestContext } from './instance'

const verifiersReturning = (result: unknown) => {
  const verifyAccessToken = vi.fn().mockResolvedValue(result)
  return {
    verifiers: { agent: { verifyAccessToken } } as unknown as TokenVerifiers,
    verifyAccessToken,
  }
}

describe('toAgentRequestContext', () => {
  const scopeId = '019c3298-2644-72f8-83c6-cdc77cc2d90e'
  const valid = {
    status: 'valid',
    expires_at_ms: Date.now() + 60_000,
    payload: {
      user: { id: 'user-id', full_name: 'Test Learner' },
      activity_id: 'activity-id',
      scope_id: scopeId,
      renew_after: 123,
    },
  }

  test('builds AgentAuth from a valid bearer token, carrying the signed scope', async () => {
    const { verifiers, verifyAccessToken } = verifiersReturning(valid)
    const context = await toAgentRequestContext('Bearer signed-token', 'request-id', verifiers)
    expect(verifyAccessToken).toHaveBeenCalledWith('signed-token')
    expect(context?.requestId).toBe('request-id')
    expect(context?.agentAuth.scope_id).toBe(scopeId)
  })

  test.each([null, 'signed-token', 'Basic abc', 'Bearer a b'])(
    'returns undefined for header %j without verifying',
    async (header) => {
      const { verifiers, verifyAccessToken } = verifiersReturning(valid)
      expect(await toAgentRequestContext(header, 'request-id', verifiers)).toBeUndefined()
      expect(verifyAccessToken).not.toHaveBeenCalled()
    }
  )

  test('returns undefined for a token that does not verify', async () => {
    const { verifiers } = verifiersReturning({ status: 'expired' })
    expect(await toAgentRequestContext('Bearer stale', 'request-id', verifiers)).toBeUndefined()
  })
})

describe('user and admin request contexts', () => {
  test('carry the session id and abilities', () => {
    const user = toUserRequestContext(
      { user: { id: 'u1' }, abilities: ['everyone'] } as never,
      'r1'
    )
    expect(user.requestId).toBe('r1')
    expect(user.userAuth.id).toBe('u1')

    const admin = toAdminRequestContext(
      { user: { id: 'a1' }, abilities: ['access_admin'] } as never,
      'r2'
    )
    expect(admin.adminAuth.admin_id).toBe('a1')
  })
})
