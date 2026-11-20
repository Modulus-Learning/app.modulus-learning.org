import { act } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createLtiPlatform: vi.fn(),
  generateCanvasConfig: vi.fn(),
  suggestLtiPlatformEndpoints: vi.fn(),
}))

vi.mock('../create', () => ({ createLtiPlatform: mocks.createLtiPlatform }))
vi.mock('../generate-canvas-config', () => ({ generateCanvasConfig: mocks.generateCanvasConfig }))
vi.mock('../suggest-endpoints', () => ({
  suggestLtiPlatformEndpoints: mocks.suggestLtiPlatformEndpoints,
}))
vi.mock('@/framework', () => ({ LangLink: () => null }))
vi.mock('@/ui/theme/provider-base', () => ({ useTheme: () => ({ theme: 'light' }) }))

import { LtiPlatformCreateForm } from './create-form'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const ISSUER = 'https://canvas.test.instructure.com'
const SUGGESTED = {
  authorization_endpoint: 'https://sso.test.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://sso.test.canvaslms.com/login/oauth2/token',
  jwks_uri: 'https://sso.test.canvaslms.com/api/lti/security/jwks',
  authorization_server: 'https://sso.test.canvaslms.com/login/oauth2/token',
}
const OTHER_ISSUER = 'https://canvas.example.edu'
const OTHER_SUGGESTED = {
  authorization_endpoint: 'https://canvas.example.edu/api/lti/authorize_redirect',
  token_endpoint: 'https://canvas.example.edu/login/oauth2/token',
  jwks_uri: 'https://canvas.example.edu/api/lti/security/jwks',
  authorization_server: 'https://canvas.example.edu/login/oauth2/token',
}
const TYPED_TOKEN_ENDPOINT = 'https://canvas.test.instructure.com/login/oauth2/token'

let container: HTMLDivElement
let root: Root

const field = (id: string): HTMLInputElement => {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)
  if (element == null) throw new Error(`missing #${id}`)
  return element
}

const button = (label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === label
  )
  if (found == null) throw new Error(`missing button ${label}`)
  return found
}

const type = async (id: string, value: string) => {
  await act(async () => {
    const element = field(id)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const click = async (label: string) => {
  await act(async () => button(label).click())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('LtiPlatformCreateForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({ ok: true, endpoints: SUGGESTED })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<LtiPlatformCreateForm lng="en" />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test('shows the four endpoint fields', () => {
    for (const id of [
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'authorization_server',
    ]) {
      expect(field(id)).toBeDefined()
    }
  })

  test('replaces every endpoint with the defaults for the issuer', async () => {
    await type('issuer', ISSUER)
    await type('token_endpoint', TYPED_TOKEN_ENDPOINT)

    await click('Fill defaults from issuer')

    expect(mocks.suggestLtiPlatformEndpoints).toHaveBeenCalledWith(ISSUER)
    for (const [id, value] of Object.entries(SUGGESTED)) {
      expect(field(id).value).toBe(value)
    }
  })

  test('replaces filled endpoints when filled again for a new issuer', async () => {
    await type('issuer', ISSUER)
    await click('Fill defaults from issuer')

    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({ ok: true, endpoints: OTHER_SUGGESTED })
    await type('issuer', OTHER_ISSUER)
    await click('Fill defaults from issuer')

    expect(mocks.suggestLtiPlatformEndpoints).toHaveBeenLastCalledWith(OTHER_ISSUER)
    for (const [id, value] of Object.entries(OTHER_SUGGESTED)) {
      expect(field(id).value).toBe(value)
    }
  })

  test('discards a response when the issuer changed while it was loading', async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.suggestLtiPlatformEndpoints.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    await type('issuer', ISSUER)
    await act(async () => button('Fill defaults from issuer').click())

    await type('issuer', OTHER_ISSUER)
    await act(async () => resolve({ ok: true, endpoints: SUGGESTED }))

    for (const id of Object.keys(SUGGESTED)) {
      expect(field(id).value).toBe('')
    }
  })

  test("shows the suggestion's refusal and fills nothing", async () => {
    mocks.suggestLtiPlatformEndpoints.mockResolvedValue({
      ok: false,
      message: 'Enter a valid https issuer first.',
    })

    await click('Fill defaults from issuer')

    expect(container.textContent).toContain('Enter a valid https issuer first.')
    expect(field('authorization_endpoint').value).toBe('')
  })
})
