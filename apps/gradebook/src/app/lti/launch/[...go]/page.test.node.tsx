import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserSession: vi.fn(),
  startActivity: vi.fn(),
}))

vi.mock('@/modules/app/activity/start-activity', () => ({ startActivity: mocks.startActivity }))
vi.mock('@/modules/app/session/storage', () => ({ getUserSession: mocks.getUserSession }))
vi.mock('@/modules/lti/components/lti-launch-activity', () => ({
  LtiLaunchActivity: () => null,
}))

import LtiLaunchPage from './page'

const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const activityUrl = 'https://content.test/activity?existing=one#authored-fragment'

describe('LTI launch interstitial page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserSession.mockResolvedValue(null)
    mocks.startActivity.mockResolvedValue({
      status: 'success',
      message: 'ok',
      data: {
        user: { id: 'user-1' },
        activity_code: { id: 'code-1', code: 'course-code' },
        activity: { id: 'activity-1', url: activityUrl },
        scope_id: scopeId,
        scope_name: 'Autumn 2026',
        modulus_server_url: 'https://modulus.test',
      },
    })
  })

  test('passes a validated scope UUID to startActivity', async () => {
    await LtiLaunchPage({
      params: Promise.resolve({ go: ['course-code', encodeURIComponent(activityUrl)] }),
      searchParams: Promise.resolve({ scope_id: scopeId }),
    })

    expect(mocks.startActivity).toHaveBeenCalledWith('course-code', activityUrl, scopeId)
  })

  test.each([
    {},
    { scope_id: 'not-a-uuid' },
    { scope_id: [scopeId, scopeId] },
  ])('renders a launch error for an invalid first-party scope parameter', async (searchParams) => {
    const result = await LtiLaunchPage({
      params: Promise.resolve({ go: ['course-code', encodeURIComponent(activityUrl)] }),
      searchParams: Promise.resolve(searchParams),
    })

    expect(renderToStaticMarkup(result)).toContain('Invalid or missing activity parameters.')
    expect(mocks.startActivity).not.toHaveBeenCalled()
  })
})
