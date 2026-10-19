import { cloneElement, createElement, type ReactElement, type ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserSession: vi.fn(),
  getActivityLaunchView: vi.fn(),
}))

vi.mock('@/modules/app/activity/activity-launch-view', () => ({
  getActivityLaunchView: mocks.getActivityLaunchView,
}))
vi.mock('@/modules/app/session/storage', () => ({ getUserSession: mocks.getUserSession }))

// The real `LtiLaunchActivity` renders here -- the anchor assertions below are
// the point of this suite -- but uikit's stylesheet imports cannot be resolved
// in node mode, so its Button is stood in for. The stand-in honours the
// `render` prop, which is how the component asks for an anchor.
vi.mock('@infonomic/uikit/react', () => ({
  Button: ({
    children,
    render,
    ...props
  }: {
    children?: ReactNode
    render?: ReactElement
    [key: string]: unknown
  }) =>
    render != null
      ? cloneElement(render, props, children)
      : createElement('button', { type: 'button', ...props }, children),
}))

import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import LtiLaunchPage from './page'

const activityId = '019c2d8e-9f01-7a4e-9c2f-2b7c1d9a5e11'
const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const modulusServerUrl = 'https://modulus.test'
const activityUrl = 'https://content.test/activity'

const view = (overrides: { activityUrl?: string; scope_name?: string | null } = {}) => ({
  status: 'success' as const,
  message: 'ok',
  data: {
    user: { id: 'user-1', full_name: 'Test Learner' },
    activity: { id: activityId, url: overrides.activityUrl ?? activityUrl },
    scope_id: scopeId,
    scope_name: overrides.scope_name ?? 'Autumn 2026',
    modulus_server_url: modulusServerUrl,
  },
})

/**
 * `searchParams` defaults as a whole rather than per key: an absent `scope_id`
 * is one of the cases under test, and a `scope_id = scopeId` default would
 * quietly substitute a valid one for it.
 */
const render = async ({
  activity_id = activityId,
  searchParams = { scope_id: scopeId },
}: {
  activity_id?: string
  searchParams?: { scope_id?: string | string[] }
} = {}) =>
  renderToStaticMarkup(
    await LtiLaunchPage({
      params: Promise.resolve({ activity_id }),
      searchParams: Promise.resolve(searchParams),
    })
  )

/**
 * Reads the `href` of the anchor whose text is the primary launch control.
 * These tests run in node mode, so there is no DOM to query -- the markup is
 * read as the string the server actually sends, which is the point.
 */
const launchHref = (markup: string): string | null => {
  const anchor = /<a\b([^>]*)>\s*Launch Now\s*<\/a>/.exec(markup)
  const href = anchor == null ? null : /\bhref="([^"]*)"/.exec(anchor[1] ?? '')?.[1]
  return href == null ? null : unescapeAttribute(href)
}

/** Undoes the HTML attribute escaping `renderToStaticMarkup` applies. */
const unescapeAttribute = (value: string): string =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

describe('LTI launch interstitial page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserSession.mockResolvedValue({
      user: { id: 'user-1', full_name: 'Test Learner' },
      abilities: [],
    })
    mocks.getActivityLaunchView.mockResolvedValue(view())
  })

  test('calls the launch view command with exactly the two ids', async () => {
    const markup = await render()

    expect(mocks.getActivityLaunchView).toHaveBeenCalledTimes(1)
    expect(mocks.getActivityLaunchView).toHaveBeenCalledWith(activityId, scopeId)
    expect(markup).toContain('Launching Activity')
  })

  test.each([
    ['a non-UUID activity id', { activity_id: 'not-a-uuid' }],
    ['a non-UUID scope id', { searchParams: { scope_id: 'not-a-uuid' } }],
    ['an absent scope id', { searchParams: {} }],
    ['a repeated scope id', { searchParams: { scope_id: [scopeId, scopeId] } }],
  ])('renders a launch error for %s', async (_label, params) => {
    const markup = await render(params)

    expect(markup).toContain('Invalid or missing activity parameters.')
    expect(mocks.getActivityLaunchView).not.toHaveBeenCalled()
  })

  test.each(['Error launching activity', 'Learner not found for activity.'])(
    'renders a launch error when the command fails with %s',
    async (message) => {
      mocks.getActivityLaunchView.mockResolvedValue({ status: 'failed', message })

      const markup = await render()

      expect(markup).toContain('Launch Error')
      expect(markup).toContain(message)
    }
  )

  test('renders authentication required with no user context', async () => {
    mocks.getActivityLaunchView.mockResolvedValue({ status: 'needs_user', message: 'Needs user.' })

    const markup = await render()

    expect(markup).toContain('Authentication Required')
  })

  test('carries an awkward canonical activity URL into the launch anchor intact', async () => {
    // In `always` mode the URL never transits a Modulus-owned URL at all: it
    // goes from the database row straight into the anchor. Preservation is
    // therefore a property of construction, which is only observable here --
    // the launch route emits only `/lti/launch/{id}?scope_id=...`.
    const awkward = 'https://content.test/a%20b/activity?discount=50%25&existing=one#authored'
    mocks.getActivityLaunchView.mockResolvedValue(view({ activityUrl: awkward }))

    const markup = await render()
    const href = launchHref(markup)

    expect(href).toBe(buildActivityLaunchUrl({ activityUrl: awkward, modulusServerUrl, scopeId }))

    const destination = new URL(String(href))
    expect(destination.pathname).toBe('/a%20b/activity')
    expect(destination.searchParams.get('discount')).toBe('50%')
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.searchParams.get('modulus')).toBe(modulusServerUrl)
    expect(destination.searchParams.get('scope_id')).toBe(scopeId)
    expect(destination.hash).toBe('#authored')
  })

  test('discloses the undecorated activity URL, not the decorated destination', async () => {
    const markup = await render()
    const destination = buildActivityLaunchUrl({ activityUrl, modulusServerUrl, scopeId })

    expect(launchHref(markup)).toBe(destination)

    // The disclosure element's text is the clean URL; only the anchor carries
    // the query Modulus adds, so the disclosure cannot silently regress into
    // showing `...?modulus=https://...&scope_id=...`.
    const disclosure = />([^<>]*content\.test[^<>]*)</.exec(markup)?.[1]
    expect(disclosure).toBe(activityUrl)
    expect(disclosure).not.toContain('modulus=')
    expect(destination).toContain('modulus=')
  })
})
