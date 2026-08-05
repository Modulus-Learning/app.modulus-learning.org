import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserSession: vi.fn(),
  headers: vi.fn(),
  startActivity: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('@infonomic/uikit/react', () => ({
  Container: ({ children }: { children?: unknown }) => children,
  Section: ({ children }: { children?: unknown }) => children,
}))
vi.mock('@/modules/app/activity/components/start-activity', () => ({
  StartActivity: () => null,
}))
vi.mock('@/modules/app/activity/start-activity', () => ({ startActivity: mocks.startActivity }))
vi.mock('@/modules/app/session/storage', () => ({ getUserSession: mocks.getUserSession }))
vi.mock('@/ui/components/breadcrumbs', () => ({ Breadcrumbs: () => null }))

import StartActivityPage from './page'

describe('non-LTI start activity page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue({ get: () => '/en/start-activity' })
    mocks.getUserSession.mockResolvedValue(null)
    mocks.startActivity.mockResolvedValue({ status: 'needs_user', message: 'Needs user.' })
  })

  test('always supplies the explicit default scope sentinel', async () => {
    const activityUrl = 'https://content.test/activity?existing=one#authored-fragment'

    await StartActivityPage({
      params: Promise.resolve({
        lng: 'en',
        go: ['course-code', encodeURIComponent(activityUrl)],
      }),
    })

    expect(mocks.startActivity).toHaveBeenCalledWith('course-code', activityUrl, DEFAULT_SCOPE_ID)
  })
})
