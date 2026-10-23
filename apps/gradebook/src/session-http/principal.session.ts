import { describe, expect, test } from 'vitest'

import {
  ADMIN,
  adminToken,
  BOUNDARY_HEADER,
  callFormFn,
  callGetFn,
  LEARNER,
  learnerToken,
} from './harness'

// Remote server-function calls (review R1): a call from the browser must name
// the page's expected principal, for reads and mutations alike. A missing or
// different principal is answered with the `changed` boundary signal before
// the handler runs; malformed arguments are refused with a 400.

const learner = { domain: 'user', userId: LEARNER.id }
const admin = { domain: 'admin', userId: ADMIN.id }

describe('native GET read, called remotely', () => {
  test('with the session principal → 200', async () => {
    const response = await callGetFn(
      'getActivityCodesFn',
      { data: [], context: { expectedPrincipal: learner } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get(BOUNDARY_HEADER)).toBeNull()
  })

  test('without an expected principal → 409 changed', async () => {
    const response = await callGetFn(
      'getActivityCodesFn',
      { data: [] },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('naming a different user → 409 changed', async () => {
    const response = await callGetFn(
      'getActivityCodesFn',
      { data: [], context: { expectedPrincipal: { domain: 'user', userId: ADMIN.id } } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('with no session → 401, no renewal signal', async () => {
    const response = await callGetFn('getActivityCodesFn', {
      data: [],
      context: { expectedPrincipal: learner },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get(BOUNDARY_HEADER)).toBeNull()
  })

  test('with malformed arguments → 400', async () => {
    const response = await callGetFn(
      'listUsersFn',
      { data: { not: 'an argument list' }, context: { expectedPrincipal: admin } },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(400)
  })

  test('an admin read with the admin principal → 200', async () => {
    const response = await callGetFn(
      'listUsersFn',
      {
        data: [
          'en',
          { page: 1, page_size: 10, order: 'created_at', desc: true, role: 'all', query: '' },
        ],
        context: { expectedPrincipal: admin },
      },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(200)
  })
})

describe('native POST mutation, called remotely', () => {
  // `createActivityCode` (learner) and `createRole` (admin): form actions whose
  // arguments travel as one FormData envelope (see `@/lib/server-action`).
  const envelope = (fields: Record<string, string>, args = '[null,"__modulus_form__"]') => {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.set(name, value)
    form.set('__args', args)
    return form
  }
  const createActivityCode = () => envelope({ name: 'Forged code', description: 'forged' })

  test('without an expected principal → 409 changed', async () => {
    const response = await callFormFn(
      'createActivityCodeFn',
      createActivityCode(),
      undefined,
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('naming a different user → 409 changed', async () => {
    const response = await callFormFn(
      'createActivityCodeFn',
      createActivityCode(),
      { expectedPrincipal: { domain: 'user', userId: ADMIN.id } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('a malformed envelope → 400', async () => {
    const response = await callFormFn(
      'createActivityCodeFn',
      envelope({ name: 'x' }, '{'),
      { expectedPrincipal: learner },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(400)
  })

  test('an admin mutation with only a learner session → 401', async () => {
    const response = await callFormFn(
      'createRoleFn',
      envelope({ name: 'Forged', machine_name: 'forged' }),
      { expectedPrincipal: learner },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(401)
  })

  test('an admin mutation with the admin principal runs and ends with its redirect', async () => {
    const response = await callFormFn(
      'createRoleFn',
      envelope({
        name: 'Session Suite Role',
        machine_name: 'session_suite_role',
        description: 'created by the session suite',
      }),
      { expectedPrincipal: admin },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('redirect')
    expect(body).toContain('/admin/roles')
  })

  test('a learner mutation with only an admin session → 401', async () => {
    const response = await callFormFn(
      'createActivityCodeFn',
      createActivityCode(),
      { expectedPrincipal: admin },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(401)
  })
})
