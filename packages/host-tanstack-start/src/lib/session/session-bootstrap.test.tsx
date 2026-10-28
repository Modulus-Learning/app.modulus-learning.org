import { act, createElement } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { SessionBootstrap } from './session-bootstrap'
import type { RenewalOutcome } from './renewal'

vi.mock('@infonomic/uikit/react', () => ({
  LoaderRing: () => createElement('span', { 'data-loader': true }),
}))

// React needs this flag to run act() outside a test renderer.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

const render = async (renew: () => Promise<RenewalOutcome>, navigate = vi.fn()) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(SessionBootstrap, {
        domain: 'user',
        returnParam: '/dashboard',
        renew,
        navigate,
      })
    )
  })
  return { navigate, text: () => container?.textContent ?? '' }
}

test('shows a spinner while renewing, with the status text for screen readers only', async () => {
  await render(() => new Promise<RenewalOutcome>(() => {}))
  const status = container?.querySelector('[role="status"]')
  expect(status?.querySelector('[data-loader]')).not.toBeNull()
  expect(status?.querySelector('.sr-only')?.textContent).toBe('Restoring your session…')
})

describe('SessionBootstrap', () => {
  test('renewed → navigates back to the return path with the loop-guard marker', async () => {
    const { navigate } = await render(async () => ({
      status: 'renewed',
      principal: { domain: 'user', userId: 'u' },
    }))
    expect(navigate).toHaveBeenCalledWith('/dashboard?_renewed=1')
  })

  test('terminal at top level → navigates to sign-in', async () => {
    const { navigate } = await render(async () => ({ status: 'terminal' }))
    expect(navigate).toHaveBeenCalledWith('/sign-in?callbackUrl=%2Fdashboard')
  })

  test('transient → a retry state, with no automatic retry', async () => {
    const renew = vi.fn(async (): Promise<RenewalOutcome> => ({ status: 'transient' }))
    const { navigate, text } = await render(renew)
    expect(text()).toContain("We couldn't restore your session")
    expect(navigate).not.toHaveBeenCalled()
    expect(renew).toHaveBeenCalledOnce()

    // A manual retry runs exactly one more attempt.
    await act(async () => {
      container?.querySelector('button')?.click()
    })
    expect(renew).toHaveBeenCalledTimes(2)
  })
})
