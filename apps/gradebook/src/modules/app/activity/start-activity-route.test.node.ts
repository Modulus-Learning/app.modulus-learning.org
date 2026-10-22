import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ startActivityFn: vi.fn() }))

vi.mock('@/modules/app/activity/start-activity-fn', () => ({
  startActivityFn: mocks.startActivityFn,
}))
vi.mock('@infonomic/uikit/react', () => ({ Container: () => null, Section: () => null }))
vi.mock('@/modules/app/activity/components/start-activity', () => ({ StartActivity: () => null }))
vi.mock('@/ui/components/breadcrumbs', () => ({ Breadcrumbs: () => null }))
vi.mock('@/framework', () => ({ usePathname: () => '/' }))

import { Route } from '@/routes/$lng/_forms/start-activity/$'

type Loader = (ctx: { location: { pathname: string } }) => Promise<{
  go: string[]
  destinationURL: string | null
}>
const loader = Route.options.loader as unknown as Loader

// Ported from the Next `start-activity/[...go]/page.test.node.tsx`: the Start
// route must hand the same launch parameters to core as the Next page did.
describe('non-LTI start activity route (Start)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.startActivityFn.mockResolvedValue({ status: 'needs_user', message: 'Needs user.' })
  })

  test('always supplies the explicit default scope sentinel, from the encoded path', async () => {
    await loader({
      location: { pathname: '/en/start-activity/course-code/https%3A/content.test/a%20b' },
    })

    expect(mocks.startActivityFn).toHaveBeenCalledWith({
      data: {
        activity_code: 'course-code',
        activity_url: 'https://content.test/a%20b',
        scope_id: DEFAULT_SCOPE_ID,
      },
    })
  })

  test('missing parameters never reach core', async () => {
    const result = await loader({ location: { pathname: '/en/start-activity/only-a-code' } })
    expect(result.destinationURL).toBeNull()
    expect(mocks.startActivityFn).not.toHaveBeenCalled()
  })
})
