import { act, createElement } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { BOUNDARY_HEADER } from './boundary'
import { flagSessionChanged, resetCoordinationForTests } from './coordination'
import { SessionChangedError, sendWithRenewal } from './replay'
import { SessionIdentity } from './session-identity'

// The session-changed interstitial (review R8), for both ways a page learns its
// session changed: a cross-tab notice and a server `changed` answer.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  resetCoordinationForTests()
})

const renderPage = async (domain: 'user' | 'admin', reload = vi.fn()) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(
        'div',
        null,
        createElement(SessionIdentity, { domain, userId: 'u1', reload }),
        createElement(
          'form',
          { id: 'stale-form' },
          createElement('button', { type: 'submit' }, 'Submit')
        )
      )
    )
  })
  return { reload }
}

const dialog = () => document.querySelector('[role="alertdialog"]')

describe('session-changed interstitial', () => {
  test('nothing is shown while the session is unchanged', async () => {
    await renderPage('user')
    expect(dialog()).toBeNull()
    expect(container?.hasAttribute('inert')).toBe(false)
  })

  test.each(['user', 'admin'] as const)(
    '%s: a flagged change shows the dialog and makes the page inert',
    async (domain) => {
      await renderPage(domain)
      await act(async () => flagSessionChanged(domain))
      expect(dialog()?.textContent).toContain('Your session has changed')
      expect(container?.hasAttribute('inert'), 'the stale form cannot be used').toBe(true)
      expect(document.activeElement?.textContent).toBe('Reload')
    }
  )

  test('a change in the other domain does not interrupt this page', async () => {
    await renderPage('user')
    await act(async () => flagSessionChanged('admin'))
    expect(dialog()).toBeNull()
  })

  test('Reload reloads the page; nothing is resubmitted', async () => {
    const { reload } = await renderPage('user')
    await act(async () => flagSessionChanged('user'))
    await act(async () => {
      ;[...document.querySelectorAll('button')].find((b) => b.textContent === 'Reload')?.click()
    })
    expect(reload).toHaveBeenCalledOnce()
  })

  test('a sign-in or sign-out notice from another tab shows the dialog', async () => {
    await renderPage('user')
    const otherTab = new BroadcastChannel('modulus.session.user')
    await act(async () => {
      otherTab.postMessage({ type: 'session-changed' })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    otherTab.close()
    expect(dialog()).not.toBeNull()
  })

  test('a server `changed` answer stops the call, sends once, and shows the dialog', async () => {
    await renderPage('user')
    const send = vi.fn(
      async () =>
        new Response('Session changed', { status: 409, headers: { [BOUNDARY_HEADER]: 'changed' } })
    )
    let thrown: unknown
    await act(async () => {
      try {
        await sendWithRenewal({
          send,
          reusable: true,
          expected: { domain: 'user', userId: 'u1' },
          renew: vi.fn(),
          flagChanged: () => flagSessionChanged('user'),
        })
      } catch (error) {
        thrown = error
      }
    })
    expect(thrown).toBeInstanceOf(SessionChangedError)
    expect(send).toHaveBeenCalledOnce()
    expect(dialog()).not.toBeNull()
  })
})
