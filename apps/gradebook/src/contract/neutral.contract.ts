import { describe, expect, test } from 'vitest'

import { MODE, request, TARGET } from './client'

// Health endpoints stay reachable in every deployment mode.
describe('neutral surface', () => {
  test('GET /routes/elb-status → 200 {status:"okay"}', async () => {
    const response = await request('/routes/elb-status')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'okay' })
  })

  // Served from the public assets: by Nitro directly, or by nginx's exact-match
  // location in the image (review R7) — run this suite through nginx too.
  test('GET /robots.txt → 200 text/plain', async () => {
    const response = await request('/robots.txt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/plain/)
    expect(await response.text()).toContain('User-agent')
  })

  // Start adds the instance's mode and jobs flag (spec: Deployment Modes item 6).
  test.runIf(TARGET === 'start')('GET /routes/elb-status names the mode', async () => {
    const body = await (await request('/routes/elb-status')).json()
    expect(body).toMatchObject({ mode: MODE, jobs: expect.any(Boolean) })
    if (MODE === 'frontend') expect(body.jobs).toBe(false)
  })

  // Recorded, not asserted: /routes/keep-alive fetches
  // `https://${process.env.VERCEL_URL}/admin`, a leftover from a Vercel
  // deployment. With VERCEL_URL unset it requests "https://undefined/admin" and
  // fails. Looks wrong; left for a decision rather than pinned as contract.
  test.todo('GET /routes/keep-alive (legacy Vercel ping; behaviour undecided)')
})
