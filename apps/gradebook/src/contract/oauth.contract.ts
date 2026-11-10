import { describe, expect, test } from 'vitest'

import { location, request, serves } from './client'

describe.runIf(serves('frontend'))('OAuth callbacks', () => {
  test('GET /routes/oauth/github?error=… → redirect to source?error=oauth_error', async () => {
    const response = await request('/routes/oauth/github?error=access_denied&source=%2Fsign-in')
    expect([303, 307]).toContain(response.status)
    expect(location(response)).toBe('/sign-in?error=oauth_error')
  })

  // Recorded, not asserted: `source` is not validated, so
  // `/routes/oauth/github?error=x&source=https://elsewhere.test` redirects
  // off-site. Looks like an open redirect; pinned neither way pending a
  // decision (it is outside this migration's scope to change).
  test.todo('github callback with an absolute `source` (open redirect; undecided)')

  test('GET /routes/oauth/google with no state → redirect to /', async () => {
    const response = await request('/routes/oauth/google')
    expect([303, 307]).toContain(response.status)
    expect(location(response)).toBe('/')
  })
})
