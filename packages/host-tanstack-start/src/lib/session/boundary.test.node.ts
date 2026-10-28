import { describe, expect, test } from 'vitest'

import { BOUNDARY_HEADER, boundaryDecision, boundaryResponse } from './boundary'
import { type Principal, principalOf } from './principal'

type Session = { user: { id: string } }
const A: Principal = { domain: 'user', userId: 'a' }
const valid = { status: 'valid' as const, session: { user: { id: 'a' } }, expiresAtMs: 1 }

const decide = (
  state: Parameters<typeof boundaryDecision<Session>>[0]['state'],
  expected: Principal | null,
  requiresExpected = true
) =>
  boundaryDecision<Session>({
    state,
    principalOf: (s) => principalOf('user', s),
    expected,
    requiresExpected,
  })

describe('boundaryDecision (runs before the handler)', () => {
  test('a matching principal continues', () => {
    expect(decide(valid, A)).toMatchObject({ action: 'continue', principal: A })
  })

  test('renewable → renew; anonymous → unauthorized', () => {
    expect(decide({ status: 'renewable' }, A)).toEqual({ action: 'renew' })
    expect(decide({ status: 'anonymous' }, A)).toEqual({ action: 'unauthorized' })
  })

  test('a different principal → changed (the handler never runs)', () => {
    expect(decide(valid, { domain: 'user', userId: 'b' })).toEqual({ action: 'changed' })
    expect(decide(valid, { domain: 'admin', userId: 'a' })).toEqual({ action: 'changed' })
  })

  test('a missing expected principal → changed when required', () => {
    expect(decide(valid, null)).toEqual({ action: 'changed' })
  })

  test('an SSR-time call (expected not required) continues without one', () => {
    expect(decide(valid, null, false)).toMatchObject({ action: 'continue' })
  })
})

describe('boundaryResponse', () => {
  test('renew and changed carry the reserved header; unauthorized does not', () => {
    expect(boundaryResponse('renew').status).toBe(401)
    expect(boundaryResponse('renew').headers.get(BOUNDARY_HEADER)).toBe('renew')
    expect(boundaryResponse('changed').status).toBe(409)
    expect(boundaryResponse('changed').headers.get(BOUNDARY_HEADER)).toBe('changed')
    expect(boundaryResponse('unauthorized').headers.get(BOUNDARY_HEADER)).toBeNull()
  })
})
