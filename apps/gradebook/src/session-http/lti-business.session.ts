import { beforeAll, describe, expect, test } from 'vitest'

import {
  ADMIN,
  BOUNDARY_HEADER,
  callFormFn,
  callPostFn,
  expiredAt,
  LEARNER,
  learnerToken,
  request,
  signInLearner,
} from './harness'

// LTI business operations behind the session boundary (review R5): the
// deep-link submission and start-activity. An expired-but-renewable session is
// told to renew, a different account is refused as `changed`, and no session
// is a plain 401 — each before the business handler runs.

const learner = { domain: 'user', userId: LEARNER.id }
let refresh: string

beforeAll(async () => {
  refresh = (await signInLearner()).refresh
})

const deepLinkForm = () => {
  const form = new FormData()
  form.set('launch_id', 'session-suite-launch')
  form.set('activity_code_id', '01900000-0000-7000-8000-00000000a0ff')
  form.set('activity_url', 'https://content.session.test/activity')
  return form
}

describe('deep-link submission', () => {
  test('expired but renewable → 401 renew, before the handler', async () => {
    const response = await callFormFn(
      'deepLinkingFn',
      deepLinkForm(),
      { expectedPrincipal: learner },
      `user_session=${await learnerToken(expiredAt())}; user_refresh=${refresh}`
    )
    expect(response.status).toBe(401)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('renew')
  })

  test('a different account → 409 changed, before the handler', async () => {
    const response = await callFormFn(
      'deepLinkingFn',
      deepLinkForm(),
      { expectedPrincipal: { domain: 'user', userId: ADMIN.id } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('no session → 401, no renewal signal', async () => {
    const response = await callFormFn('deepLinkingFn', deepLinkForm(), {
      expectedPrincipal: learner,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get(BOUNDARY_HEADER)).toBeNull()
  })
})

describe('start activity', () => {
  const page = '/start-activity/session-code/https%3A/content.session.test/activity'
  const data = {
    activity_code: 'session-code',
    activity_url: 'https://content.session.test/activity',
    scope_id: '00000000-0000-0000-0000-000000000000',
  }

  test('the page with an expired but renewable session → the renewal bootstrap', async () => {
    const response = await request(page, {
      headers: {
        cookie: `user_session=${await learnerToken(expiredAt())}; user_refresh=${refresh}`,
      },
    })
    expect([302, 307]).toContain(response.status)
    expect(response.headers.get('location')).toMatch(/^\/auth\/renew\?return=/)
  })

  test('the page without a session → 200 (needs a user)', async () => {
    const response = await request(page)
    expect(response.status).toBe(200)
  })

  test('remote call naming a different account → 409 changed', async () => {
    const response = await callPostFn(
      'startActivityFn',
      { data, context: { expectedPrincipal: { domain: 'user', userId: ADMIN.id } } },
      `user_session=${await learnerToken()}`
    )
    expect(response.status).toBe(409)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('changed')
  })

  test('remote call with an expired but renewable session → 401 renew', async () => {
    const response = await callPostFn(
      'startActivityFn',
      { data, context: { expectedPrincipal: learner } },
      `user_session=${await learnerToken(expiredAt())}; user_refresh=${refresh}`
    )
    expect(response.status).toBe(401)
    expect(response.headers.get(BOUNDARY_HEADER)).toBe('renew')
  })
})
