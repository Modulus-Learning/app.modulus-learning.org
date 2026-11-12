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
  token_endpoint: 'https://canvas.test.instructure.com/login/oauth2/token',
  jwks_uri: 'https://canvas.test.instructure.com/api/lti/security/jwks',
  authorization_server: 'https://canvas.test.instructure.com/login/oauth2/token',
}
const TYPED_TOKEN_ENDPOINT = 'https://sso.test.canvaslms.com/login/oauth2/token'

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

  test('fills only the empty endpoints from the issuer and keeps a typed one', async () => {
    await type('issuer', ISSUER)
    await type('token_endpoint', TYPED_TOKEN_ENDPOINT)

    await click('Fill defaults from issuer')

    expect(mocks.suggestLtiPlatformEndpoints).toHaveBeenCalledWith(ISSUER)
    expect(field('token_endpoint').value).toBe(TYPED_TOKEN_ENDPOINT)
    expect(field('authorization_endpoint').value).toBe(SUGGESTED.authorization_endpoint)
    expect(field('jwks_uri').value).toBe(SUGGESTED.jwks_uri)
    expect(field('authorization_server').value).toBe(SUGGESTED.authorization_server)
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
