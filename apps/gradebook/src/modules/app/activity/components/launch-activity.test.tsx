import { act, createElement, type ReactNode } from 'react'

import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@infonomic/uikit/react', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('button', { type: 'button', ...props }, children),
}))

import { LaunchActivity } from './launch-activity'
import type { StartActivityResult } from '../@types'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('LaunchActivity', () => {
  test('launches a non-LTI activity with the canonical sentinel returned by core', () => {
    const activityUrl = 'https://content.test/activity?existing=one#authored-fragment'
    const modulusServerUrl = 'https://modulus.test/base?issuer=value'
    const scopeId = '00000000-0000-0000-0000-000000000000'
    const startActivityResult: StartActivityResult = {
      status: 'success',
      message: 'ok',
      data: {
        user: { id: 'user-1', full_name: 'Test Learner' },
        activity_code: { id: 'code-1', code: 'course-code' },
        activity: { id: 'activity-1', url: activityUrl },
        scope_id: scopeId,
        scope_name: null,
        modulus_server_url: modulusServerUrl,
      },
    }

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() =>
      root.render(
        <LaunchActivity
          lng={'en' as never}
          session={null}
          currentPath={null}
          destinationURL={activityUrl}
          startActivityResult={startActivityResult}
        />
      )
    )

    const button = container.querySelector('button')
    act(() => button?.click())

    expect(mocks.replace).toHaveBeenCalledOnce()
    const destination = new URL(String(mocks.replace.mock.calls[0]?.[0]))
    expect(destination.searchParams.getAll('modulus')).toEqual([modulusServerUrl])
    expect(destination.searchParams.getAll('scope_id')).toEqual([scopeId])
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.hash).toBe('#authored-fragment')

    act(() => root.unmount())
  })
})
