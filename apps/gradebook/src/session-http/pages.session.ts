import { describe, expect, test } from 'vitest'

import { ADMIN, adminToken, LEARNER, learnerToken, request } from './harness'

// Authenticated server rendering (review R1): each page's loader runs its
// native GET read in-process with a verified session, and renders the seeded
// synthetic account. No expected principal exists during SSR, and none is
// required for an in-process call.

const page = async (path: string, cookie: string) => {
  const response = await request(path, { headers: { cookie } })
  const html = await response.text()
  return { status: response.status, html, location: response.headers.get('location') }
}

describe('learner pages with a valid session', () => {
  test.each(['/dashboard', '/account', '/es/account'])('GET %s → 200', async (path) => {
    const { status, location } = await page(path, `user_session=${await learnerToken()}`)
    expect(location).toBeNull()
    expect(status).toBe(200)
  })

  test('GET /account renders the signed-in account', async () => {
    const { status, html } = await page('/account', `user_session=${await learnerToken()}`)
    expect(status).toBe(200)
    expect(html).toContain(LEARNER.email)
  })
})

describe('admin pages with a valid session', () => {
  test.each(['/admin', '/admin/account', '/admin/users', '/es/admin/account'])(
    'GET %s → 200',
    async (path) => {
      const { status, location } = await page(path, `admin_session=${await adminToken()}`)
      expect(location).toBeNull()
      expect(status).toBe(200)
    }
  )

  test('GET /admin/account renders the signed-in admin', async () => {
    const { status, html } = await page('/admin/account', `admin_session=${await adminToken()}`)
    expect(status).toBe(200)
    expect(html).toContain(ADMIN.email)
  })

  test('GET /admin/users lists the seeded learner', async () => {
    const { status, html } = await page('/admin/users', `admin_session=${await adminToken()}`)
    expect(status).toBe(200)
    expect(html).toContain(LEARNER.email)
  })
})

describe('sessions do not cross domains', () => {
  test('a learner session is not an admin session', async () => {
    const { status, location } = await page('/admin', `user_session=${await learnerToken()}`)
    expect([302, 307]).toContain(status)
    expect(location).toBe('/admin/sign-in?callbackUrl=%2Fadmin')
  })
})
