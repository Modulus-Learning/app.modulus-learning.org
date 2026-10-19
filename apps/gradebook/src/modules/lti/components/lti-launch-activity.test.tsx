import { act, cloneElement, createElement, type ReactElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

// The stand-in honours the `render` prop, which is how the component asks the
// design-system Button for an anchor.
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
import { LtiLaunchActivity } from './lti-launch-activity'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const activityUrl =
  'https://content.test/activity?existing=one&modulus=old&scope_id=old#authored-fragment'
const modulusServerUrl = 'https://modulus.test/base?issuer=value'
const destination = buildActivityLaunchUrl({ activityUrl, modulusServerUrl, scopeId })

const session = {
  user: { id: 'user-1', full_name: 'Test Learner' },
  abilities: [],
}

const props = (overrides: { scopeName?: string | null; isDefaultScope?: boolean } = {}) => ({
  session,
  destination,
  activityUrl,
  scopeName: overrides.scopeName ?? null,
  isDefaultScope: overrides.isDefaultScope ?? false,
})

const mount = (element: ReactNode): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return { container, root }
}

const launchAnchor = (container: ParentNode): HTMLAnchorElement | undefined =>
  Array.from(container.querySelectorAll('a')).find(
    (anchor) => anchor.textContent?.trim() === 'Launch Now'
  )

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('LtiLaunchActivity', () => {
  test('renders truthful named, unnamed, and default context messages as text', () => {
    const unsafeName = '<img src=x onerror=alert(1)> Autumn 2026'
    const named = renderToStaticMarkup(
      <LtiLaunchActivity {...props({ scopeName: unsafeName })} navigate={() => undefined} />
    )
    document.body.innerHTML = named
    expect(document.querySelector('[data-testid="scope-context"]')?.textContent).toContain(
      unsafeName
    )
    expect(document.querySelector('[data-testid="scope-context"] img')).toBeNull()

    const unnamed = renderToStaticMarkup(
      <LtiLaunchActivity {...props()} navigate={() => undefined} />
    )
    expect(unnamed).toContain('scoped learning context')

    const defaultContext = renderToStaticMarkup(
      <LtiLaunchActivity {...props({ isDefaultScope: true })} navigate={() => undefined} />
    )
    expect(defaultContext).toContain('default learning context')
  })

  test('puts the launch anchor in the server-rendered HTML, before any hydration', () => {
    // Asserted against `renderToStaticMarkup` rather than a mounted tree: the
    // launch must be a navigation present in the initial HTML, so the page
    // works with scripting disabled.
    const markup = renderToStaticMarkup(
      <LtiLaunchActivity {...props({ scopeName: 'Autumn 2026' })} navigate={() => undefined} />
    )
    document.body.innerHTML = markup

    expect(launchAnchor(document)?.getAttribute('href')).toBe(destination)

    // The secondary "if you are not redirected" control is an anchor too, so
    // no launch path depends on a click handler.
    const fallback = Array.from(document.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'open the activity'
    )
    expect(fallback?.getAttribute('href')).toBe(destination)
    expect(document.querySelector('button[type="button"]')?.textContent).toBe('Cancel')
  })

  test('discloses the clean activity URL rather than the decorated destination', () => {
    const markup = renderToStaticMarkup(
      <LtiLaunchActivity {...props({ scopeName: 'Autumn 2026' })} navigate={() => undefined} />
    )
    document.body.innerHTML = markup

    const disclosure = Array.from(document.querySelectorAll('p')).find((paragraph) =>
      paragraph.textContent?.startsWith('https://content.test/')
    )
    expect(disclosure?.textContent).toBe(activityUrl)
    expect(disclosure?.textContent).not.toBe(destination)
    expect(disclosure?.textContent).not.toContain('modulus=https%3A')
  })

  test('tells the truth in <noscript>: the countdown needs scripting, the launch does not', () => {
    const markup = renderToStaticMarkup(
      <LtiLaunchActivity {...props()} navigate={() => undefined} />
    )

    expect(markup).not.toContain('JavaScript is required to launch this activity')
    expect(markup).toContain('Automatic redirection needs JavaScript')
  })

  test('uses the same scope-safe destination for the anchor and the countdown', async () => {
    vi.useFakeTimers()
    const navigate = vi.fn()
    const { container, root } = mount(
      <LtiLaunchActivity {...props({ scopeName: 'Autumn 2026' })} navigate={navigate} />
    )

    // The manual path is the anchor's own navigation, so its `href` is the
    // assertion; the countdown is the only path that goes through `navigate`.
    expect(launchAnchor(container)?.getAttribute('href')).toBe(destination)

    for (let second = 0; second < 10; second += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(navigate).toHaveBeenCalledWith(destination)

    const target = new URL(destination)
    expect(target.searchParams.getAll('modulus')).toEqual([modulusServerUrl])
    expect(target.searchParams.getAll('scope_id')).toEqual([scopeId])
    expect(target.searchParams.get('existing')).toBe('one')
    expect(target.hash).toBe('#authored-fragment')

    act(() => root.unmount())
  })

  test('preserves countdown cancellation', async () => {
    vi.useFakeTimers()
    const navigate = vi.fn()
    const { container, root } = mount(<LtiLaunchActivity {...props()} navigate={navigate} />)

    const cancel = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel'
    )
    act(() => cancel?.click())
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })

    expect(navigate).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Auto-redirect cancelled.')

    // Cancelling stops the automatic hop, never the learner's own link.
    expect(launchAnchor(container)?.getAttribute('href')).toBe(destination)
    act(() => root.unmount())
  })
})
