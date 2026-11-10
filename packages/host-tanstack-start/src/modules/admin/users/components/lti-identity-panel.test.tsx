import { act, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { LtiIdentity } from '../@types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), unlink: vi.fn(), coreUnlink: vi.fn() }))

vi.mock('@/framework', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
// The server logic's only dependency: core, which records what it was asked.
vi.mock('@/core-adapter', () => ({
  getCoreAdminRequestContext: async () => ({ admin_id: 'admin-1' }),
  getCoreCommands: async () => ({
    admin: { users: { unlinkUserLtiIdentity: mocks.coreUnlink } },
  }),
}))
vi.mock('../unlink-lti', () => ({ unlinkUserLtiIdentity: mocks.unlink }))
// The uikit ships CSS modules the test runner cannot load.
vi.mock('@infonomic/uikit/react', () => ({
  Alert: ({ children }: { children?: ReactNode }) =>
    createElement('div', { role: 'alert' }, children),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => createElement('button', { type: 'button', onClick, disabled }, children),
}))

import { LtiIdentityPanel, ltiIdentityPanelKey } from './lti-identity-panel'

const USER_ID = '019d27b5-ce97-751b-ba8c-ac3fccc26931'
const LINKED: LtiIdentity = { issuer: 'https://canvas.test', subject: 'subject-1', linked: true }

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  mocks.refresh.mockReset()
  mocks.unlink.mockReset()
  mocks.coreUnlink.mockReset()
})

type Props = { vid?: number; lti?: LtiIdentity | null; canUnlink?: boolean; userId?: string }

const element = ({ vid = 3, lti = LINKED, canUnlink = true, userId = USER_ID }: Props) =>
  createElement(LtiIdentityPanel, {
    key: ltiIdentityPanelKey({ userId, vid, lti }),
    userId,
    vid,
    lti,
    canUnlink,
  })

const render = (props: Props = {}) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(element(props)))
  return container
}

const rerender = (props: Props) => act(() => root?.render(element(props)))

const button = (view: HTMLElement, label: string) =>
  Array.from(view.querySelectorAll('button')).find((el) => el.textContent === label)

const state = (view: HTMLElement) => view.querySelector('[data-testid="lti-state"]')?.textContent

describe('LtiIdentityPanel states', () => {
  test('not linked', () => {
    const view = render({ lti: null })
    expect(state(view)).toBe('Not linked.')
    expect(button(view, 'Unlink')).toBeUndefined()
  })

  test('linked shows issuer and subject', () => {
    const view = render()
    expect(state(view)).toBe('Linked.')
    expect(view.textContent).toContain('https://canvas.test')
    expect(view.textContent).toContain('subject-1')
  })

  test('incomplete identity data renders, and can still be cleared', () => {
    const view = render({ lti: { issuer: 'https://canvas.test', subject: null, linked: false } })
    expect(state(view)).toBe('Not linked (incomplete LTI identity data).')
    expect(button(view, 'Unlink')).toBeDefined()
  })

  test('the Unlink button is hidden without users:edit', () => {
    const view = render({ canUnlink: false })
    expect(button(view, 'Unlink')).toBeUndefined()
  })
})

describe('LtiIdentityPanel confirmation', () => {
  test('Unlink asks for confirmation and states the consequences', () => {
    const view = render()
    act(() => button(view, 'Unlink')?.click())

    const confirm = view.querySelector('[data-testid="lti-confirm"]')
    expect(confirm).not.toBeNull()
    expect(confirm?.textContent).toContain('whichever launch arrives first')
    expect(confirm?.textContent).toContain('does not sign anyone out')
    expect(confirm?.textContent).toContain('disable the account')
    expect(button(view, 'Confirm unlink')).toBeDefined()
    expect(mocks.unlink).not.toHaveBeenCalled()
  })

  test('Confirm unlink sends the id, vid and the identity that was shown', async () => {
    mocks.unlink.mockResolvedValue({ status: 'success', message: 'LTI identity unlinked.' })
    const view = render()
    act(() => button(view, 'Unlink')?.click())
    await act(async () => button(view, 'Confirm unlink')?.click())

    const formData = mocks.unlink.mock.calls[0]?.[1] as FormData
    expect(Object.fromEntries(formData.entries())).toEqual({
      id: USER_ID,
      vid: '3',
      expected: JSON.stringify({ issuer: 'https://canvas.test', subject: 'subject-1' }),
    })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  test('a conflict shows the refresh message', async () => {
    mocks.unlink.mockResolvedValue({ status: 'conflict', message: 'Refresh and try again.' })
    const view = render()
    act(() => button(view, 'Unlink')?.click())
    await act(async () => button(view, 'Confirm unlink')?.click())

    expect(view.querySelector('[role="alert"]')?.textContent).toBe('Refresh and try again.')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  test.each([
    ['a new vid', { vid: 4 }],
    ['another user', { userId: '019d27b5-ce97-751b-ba8c-ac3fccc26932' }],
    ['a changed identity', { lti: { ...LINKED, subject: 'subject-2' } }],
  ])('a pending confirmation does not survive %s', (_label, change) => {
    const view = render()
    act(() => button(view, 'Unlink')?.click())
    expect(view.querySelector('[data-testid="lti-confirm"]')).not.toBeNull()

    rerender(change)

    expect(view.querySelector('[data-testid="lti-confirm"]')).toBeNull()
    expect(button(view, 'Unlink')).toBeDefined()
  })
})

describe('LtiIdentityPanel to server transport', () => {
  // Review finding: null and the empty string must arrive at core as they were
  // shown, or the conditional unlink can never match a stored empty value.
  test.each([
    ['an empty subject', { issuer: 'https://canvas.test', subject: '' }],
    ['a null subject', { issuer: 'https://canvas.test', subject: null }],
    ['a null issuer', { issuer: null, subject: 'subject-1' }],
    ['an empty issuer and null subject', { issuer: '', subject: null }],
  ])('%s reaches core unchanged', async (_label, identity) => {
    const server =
      await vi.importActual<typeof import('../unlink-lti.server')>('../unlink-lti.server')
    mocks.unlink.mockImplementation(server.unlinkUserLtiIdentity)
    mocks.coreUnlink.mockResolvedValue({ ok: true, data: { changed: true, vid: 4 } })

    const lti: LtiIdentity = {
      ...identity,
      linked: identity.issuer != null && identity.subject != null,
    }
    const view = render({ lti })
    act(() => button(view, 'Unlink')?.click())
    await act(async () => button(view, 'Confirm unlink')?.click())

    expect(mocks.coreUnlink).toHaveBeenCalledTimes(1)
    expect(mocks.coreUnlink.mock.calls[0]?.[1]).toEqual({
      id: USER_ID,
      vid: 3,
      lti_iss: identity.issuer,
      lti_sub: identity.subject,
    })
  })

  test('a malformed expected identity is refused before core', async () => {
    const server =
      await vi.importActual<typeof import('../unlink-lti.server')>('../unlink-lti.server')
    const formData = new FormData()
    formData.append('id', USER_ID)
    formData.append('vid', '3')
    formData.append('expected', '{"issuer":')

    const state = await server.unlinkUserLtiIdentity({ status: 'idle' }, formData)

    expect(state.status).toBe('failed')
    expect(mocks.coreUnlink).not.toHaveBeenCalled()
  })
})

describe('ltiIdentityPanelKey', () => {
  test('values containing separators do not collide', () => {
    const a = ltiIdentityPanelKey({
      userId: USER_ID,
      vid: 1,
      lti: { issuer: 'https://canvas.test/a:b', subject: 'c', linked: true },
    })
    const b = ltiIdentityPanelKey({
      userId: USER_ID,
      vid: 1,
      lti: { issuer: 'https://canvas.test/a', subject: 'b:c', linked: true },
    })
    expect(a).not.toBe(b)
  })

  test('null and the empty string give different keys', () => {
    const empty = ltiIdentityPanelKey({
      userId: USER_ID,
      vid: 1,
      lti: { issuer: 'https://canvas.test', subject: '', linked: true },
    })
    const missing = ltiIdentityPanelKey({
      userId: USER_ID,
      vid: 1,
      lti: { issuer: 'https://canvas.test', subject: null, linked: false },
    })
    expect(empty).not.toBe(missing)
  })
})
