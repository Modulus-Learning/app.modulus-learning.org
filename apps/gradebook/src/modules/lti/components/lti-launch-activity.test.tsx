import { act, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@infonomic/uikit/react', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('button', { type: 'button', ...props }, children),
}))

import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import { LtiLaunchActivity } from './lti-launch-activity'
import type { StartActivityResult } from '@/modules/app/activity/@types'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const activityUrl =
  'https://content.test/activity?existing=one&modulus=old&scope_id=old#authored-fragment'
const modulusServerUrl = 'https://modulus.test/base?issuer=value'

const result = (scope_name: string | null, scope_id = scopeId): StartActivityResult => ({
  status: 'success',
  message: 'ok',
  data: {
    user: { id: 'user-1', full_name: 'Test Learner' },
    activity_code: { id: 'code-1', code: 'course-code' },
    activity: { id: 'activity-1', url: activityUrl },
    scope_id,
    scope_name,
    modulus_server_url: modulusServerUrl,
  },
})

const session = {
  user: { id: 'user-1', full_name: 'Test Learner' },
  abilities: [],
}

const mount = (element: ReactNode): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return { container, root }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('LtiLaunchActivity', () => {
  test('renders truthful named, unnamed, and default context messages as text', () => {
    const unsafeName = '<img src=x onerror=alert(1)> Autumn 2026'
    const named = renderToStaticMarkup(
      <LtiLaunchActivity
        session={session}
        startActivityResult={result(unsafeName)}
        isDefaultScope={false}
        navigate={() => undefined}
      />
    )
    document.body.innerHTML = named
    expect(document.querySelector('[data-testid="scope-context"]')?.textContent).toContain(
      unsafeName
    )
    expect(document.querySelector('[data-testid="scope-context"] img')).toBeNull()

    const unnamed = renderToStaticMarkup(
      <LtiLaunchActivity
        session={session}
        startActivityResult={result(null)}
        isDefaultScope={false}
        navigate={() => undefined}
      />
    )
    expect(unnamed).toContain('scoped learning context')

    const defaultContext = renderToStaticMarkup(
      <LtiLaunchActivity
        session={session}
        startActivityResult={result(null, '00000000-0000-0000-0000-000000000000')}
        isDefaultScope
        navigate={() => undefined}
      />
    )
    expect(defaultContext).toContain('default learning context')
    expect(defaultContext).toContain('JavaScript is required')
  })

  test('uses the same scope-safe destination for manual and countdown launches', async () => {
    vi.useFakeTimers()
    const navigate = vi.fn()
    const { container, root } = mount(
      <LtiLaunchActivity
        session={session}
        startActivityResult={result('Autumn 2026')}
        isDefaultScope={false}
        navigate={navigate}
      />
    )
    const expected = buildActivityLaunchUrl({
      activityUrl,
      modulusServerUrl,
      scopeId,
    })

    const launchButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Launch Now'
    )
    act(() => launchButton?.click())
    expect(navigate).toHaveBeenLastCalledWith(expected)

    navigate.mockClear()
    for (let second = 0; second < 10; second += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(navigate).toHaveBeenCalledWith(expected)

    const destination = new URL(expected)
    expect(destination.searchParams.getAll('modulus')).toEqual([modulusServerUrl])
    expect(destination.searchParams.getAll('scope_id')).toEqual([scopeId])
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.hash).toBe('#authored-fragment')

    act(() => root.unmount())
  })

  test('preserves countdown cancellation', async () => {
    vi.useFakeTimers()
    const navigate = vi.fn()
    const { container, root } = mount(
      <LtiLaunchActivity
        session={session}
        startActivityResult={result(null)}
        isDefaultScope={false}
        navigate={navigate}
      />
    )

    const cancel = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel'
    )
    act(() => cancel?.click())
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })

    expect(navigate).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Auto-redirect cancelled.')
    act(() => root.unmount())
  })
})
