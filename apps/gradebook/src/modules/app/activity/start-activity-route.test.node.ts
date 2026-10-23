import { DEFAULT_SCOPE_ID } from '@modulus-learning/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  startActivityFn: vi.fn(),
  getUserSessionFn: vi.fn(),
  renewInBrowser: vi.fn(),
}))

vi.mock('@/modules/app/activity/start-activity-fn', () => ({
  startActivityFn: mocks.startActivityFn,
}))
vi.mock('@/modules/app/session/session-state', () => ({
  getUserSessionFn: mocks.getUserSessionFn,
}))
vi.mock('@/lib/session/browser-renewal', () => ({ renewInBrowser: mocks.renewInBrowser }))
vi.mock('@infonomic/uikit/react', () => ({ Container: () => null, Section: () => null }))
vi.mock('@/modules/app/activity/components/start-activity', () => ({ StartActivity: () => null }))
vi.mock('@/ui/components/breadcrumbs', () => ({ Breadcrumbs: () => null }))
vi.mock('@/framework', () => ({ usePathname: () => '/' }))

import { Route } from '@/routes/$lng/_forms/start-activity/$'

type Loader = (ctx: { location: { pathname: string; href?: string } }) => Promise<{
  go: string[]
  destinationURL: string | null
}>
const loader = Route.options.loader as unknown as Loader

// Ported from the Next `start-activity/[...go]/page.test.node.tsx`: the Start
// route must hand the same launch parameters to core as the Next page did.
describe('non-LTI start activity route (Start)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.startActivityFn.mockResolvedValue({ status: 'success', message: 'ok', data: {} })
    mocks.getUserSessionFn.mockResolvedValue({ session: { user: { id: 'u1' } }, renewable: false })
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

  // Review R5: the session is decided before the business function runs.
  test('an anonymous visitor gets needs_user without reaching core', async () => {
    mocks.getUserSessionFn.mockResolvedValue({ session: null, renewable: false })
    const result = (await loader({
      location: { pathname: '/en/start-activity/course-code/https%3A/content.test/a' },
    })) as unknown as { result: { status: string } }
    expect(result.result.status).toBe('needs_user')
    expect(mocks.startActivityFn).not.toHaveBeenCalled()
  })

  test('a renewable session on a server render goes to the bootstrap, not core', async () => {
    mocks.getUserSessionFn.mockResolvedValue({ session: null, renewable: true })
    const path = '/es/start-activity/course-code/https%3A/content.test/a'
    let thrown: unknown
    try {
      await loader({ location: { pathname: path, href: path } })
    } catch (error) {
      thrown = error
    }
    expect((thrown as { options?: { href?: string } })?.options?.href).toMatch(
      /^\/auth\/renew\?return=/
    )
    expect(mocks.startActivityFn).not.toHaveBeenCalled()
    expect(mocks.renewInBrowser).not.toHaveBeenCalled()
  })
})
