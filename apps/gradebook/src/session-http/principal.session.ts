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
        data: ['en', { page: 1, page_size: 10, order: 'created_at', desc: true }],
        context: { expectedPrincipal: admin },
      },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(200)
  })
})

describe('bridged POST mutation, called remotely', () => {
  const envelope = (fields: Record<string, string>) => {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.set(name, value)
    return form
  }
  const editFullName = () =>
    envelope({
      __key: 'app/account/edit-full-name',
      __export: 'editFullName',
      __args: '[null,"__modulus_form__"]',
      full_name: 'Changed By A Forged Call',
    })

  test('without an expected principal → 409 changed', async () => {
    const response = await callFormFn(
      'invokeAppAction',
      editFullName(),
      undefined,
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('naming a different user → 409 changed', async () => {
    const response = await callFormFn(
      'invokeAppAction',
      editFullName(),
      { expectedPrincipal: { domain: 'user', userId: ADMIN.id } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('a malformed envelope → 400', async () => {
    const response = await callFormFn(
      'invokeAppAction',
      envelope({ __key: 'app/account/edit-full-name', __export: 'editFullName', __args: '{' }),
      { expectedPrincipal: learner },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(400)
  })

  test('a module outside the allowlist → 404', async () => {
    const response = await callFormFn(
      'invokeAppAction',
      envelope({ __key: 'app/not-a-module', __export: 'run', __args: '[]' }),
      { expectedPrincipal: learner },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(404)
  })

  test('a learner module through the admin bridge → 404', async () => {
    const response = await callFormFn(
      'invokeAdminAction',
      editFullName(),
      { expectedPrincipal: admin },
      `admin_session=${await adminToken()}`
    )
    expect(response.status).toBe(404)
  })
})
