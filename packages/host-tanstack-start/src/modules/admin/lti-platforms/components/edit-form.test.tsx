import { act } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { LtiPlatform } from '../@types'

const mocks = vi.hoisted(() => ({
  updateLtiPlatform: vi.fn(),
  suggestLtiPlatformEndpoints: vi.fn(),
}))

vi.mock('../update', () => ({ updateLtiPlatform: mocks.updateLtiPlatform }))
vi.mock('../suggest-endpoints', () => ({
  suggestLtiPlatformEndpoints: mocks.suggestLtiPlatformEndpoints,
}))
vi.mock('@/framework', () => ({ LangLink: () => null }))
vi.mock('@/ui/theme/provider-base', () => ({ useTheme: () => ({ theme: 'light' }) }))

import { LtiPlatformEditForm } from './edit-form'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const PLATFORM: LtiPlatform = {
  id: '019c2d8e-842a-7715-a323-a7e31427db2d',
  name: 'Canvas Test',
  issuer: 'https://canvas.test.instructure.com',
  client_id: '10000000000001',
  authorization_endpoint: 'https://canvas.test.instructure.com/api/lti/authorize_redirect',
  token_endpoint: 'https://canvas.test.instructure.com/login/oauth2/token',
  jwks_uri: 'https://canvas.test.instructure.com/api/lti/security/jwks',
  authorization_server: 'https://canvas.test.instructure.com/login/oauth2/token',
}
const SUGGESTED = {
  authorization_endpoint: 'https://sso.test.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://suggested.test/token',
  jwks_uri: 'https://suggested.test/jwks',
  authorization_server: 'suggested.test',
}
const ENDPOINTS = ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'authorization_server']

let container: HTMLDivElement
let root: Root

const field = (id: string): HTMLInputElement => {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)
  if (element == null) throw new Error(`missing #${id}`)
  return element
}

const findButton = (label: string) =>
  [...container.querySelectorAll('button')].find((element) => element.textContent === label)

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const click = async (label: string) => {
  const found = findButton(label)
  if (found == null) throw new Error(`missing button ${label}`)
  await act(async () => found.click())
  await flush()
}

const type = async (id: string, value: string) => {
  await act(async () => {
    const element = field(id)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('LtiPlatformEditForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.updateLtiPlatform.mockResolvedValue({ errors: {}, status: 'idle' })
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({ ok: true, endpoints: SUGGESTED })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(<LtiPlatformEditForm lng="en" data={{ platform: PLATFORM }} />)
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test('shows the issuer read-only and prefills the editable fields', () => {
    expect(field('issuer').readOnly).toBe(true)
    expect(field('issuer').value).toBe(PLATFORM.issuer)
    expect(field('name').value).toBe(PLATFORM.name)
    expect(field('client_id').value).toBe(PLATFORM.client_id)
    for (const id of ENDPOINTS) {
      expect(field(id).value).toBe(PLATFORM[id as keyof LtiPlatform])
    }
  })

  test('submits the id, name, client ID and four endpoints, and no issuer', async () => {
    const corrected = 'https://sso.test.canvaslms.com/api/lti/authorize_redirect'
    await type('authorization_endpoint', corrected)

    await click('Save')

    expect(mocks.updateLtiPlatform).toHaveBeenCalledTimes(1)
    const sent = mocks.updateLtiPlatform.mock.calls[0]?.[1] as FormData
    expect(Object.fromEntries(sent.entries())).toEqual({
      id: PLATFORM.id,
      name: PLATFORM.name,
      client_id: PLATFORM.client_id,
      authorization_endpoint: corrected,
      token_endpoint: PLATFORM.token_endpoint,
      jwks_uri: PLATFORM.jwks_uri,
      authorization_server: PLATFORM.authorization_server,
    })
    expect(sent.has('issuer')).toBe(false)
  })

  test('replaces the endpoints with the defaults only after the inline confirmation', async () => {
    await click('Fill defaults from issuer')

    // Asked, not yet replaced.
    expect(container.textContent).toContain(
      "Replace all four endpoints with the adapter's defaults?"
    )
    expect(mocks.suggestLtiPlatformEndpoints).not.toHaveBeenCalled()
    expect(field('authorization_endpoint').value).toBe(PLATFORM.authorization_endpoint)

    await click('Replace')

    expect(mocks.suggestLtiPlatformEndpoints).toHaveBeenCalledWith(PLATFORM.issuer)
    for (const id of ENDPOINTS) {
      expect(field(id).value).toBe(SUGGESTED[id as keyof typeof SUGGESTED])
    }
  })

  test('cancelling the confirmation keeps the stored endpoints', async () => {
    await click('Fill defaults from issuer')
    await click('Cancel')

    expect(mocks.suggestLtiPlatformEndpoints).not.toHaveBeenCalled()
    expect(findButton('Replace')).toBeUndefined()
    for (const id of ENDPOINTS) {
      expect(field(id).value).toBe(PLATFORM[id as keyof LtiPlatform])
    }
  })
})
