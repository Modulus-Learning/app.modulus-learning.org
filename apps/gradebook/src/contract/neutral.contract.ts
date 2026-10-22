import { describe, expect, test } from 'vitest'

import { request } from './client'

// Health endpoints stay reachable in every deployment mode.
describe('neutral surface', () => {
  test('GET /routes/elb-status → 200 {status:"okay"}', async () => {
    const response = await request('/routes/elb-status')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'okay' })
  })

  // Recorded, not asserted: /routes/keep-alive fetches
  // `https://${process.env.VERCEL_URL}/admin`, a leftover from a Vercel
  // deployment. With VERCEL_URL unset it requests "https://undefined/admin" and
  // fails. Looks wrong; left for a decision rather than pinned as contract.
  test.todo('GET /routes/keep-alive (legacy Vercel ping; behaviour undecided)')
})
