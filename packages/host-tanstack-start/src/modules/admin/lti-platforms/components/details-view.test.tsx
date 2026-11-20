import { act } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { AdminSession } from '@/modules/admin/session/@types'
import type { LtiPlatform } from '../@types'

// A link stand-in that keeps the href, so the test can see where Edit goes.
vi.mock('@/framework', () => ({
  LangLink: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { AdminSessionProvider } from '@/modules/admin/session/provider'
import { LtiPlatformDetailsView } from './details-view'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const PLATFORM: LtiPlatform = {
  id: '019c2d8e-842a-7715-a323-a7e31427db2d',
  name: 'Canvas Test',
  issuer: 'https://canvas.test.instructure.com',
  client_id: '10000000000001',
  authorization_endpoint: 'https://sso.test.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://sso.test.canvaslms.com/login/oauth2/token',
  jwks_uri: 'https://sso.test.canvaslms.com/api/lti/security/jwks',
  authorization_server: 'https://sso.test.canvaslms.com/login/oauth2/token',
}

const session = (abilities: string[]) => ({ abilities }) as unknown as AdminSession

let container: HTMLDivElement | undefined
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

const render = async (adminSession: AdminSession | null) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root?.render(
      <AdminSessionProvider session={adminSession}>
        <LtiPlatformDetailsView lng="en" data={{ platform: PLATFORM }} mode="view" />
      </AdminSessionProvider>
    )
  )
  return container
}

const editLink = (view: HTMLElement) =>
  [...view.querySelectorAll('a')].find((element) => element.textContent === 'Edit')

describe('LtiPlatformDetailsView', () => {
  test('links to the edit page for a holder of lti-platforms:edit', async () => {
    const view = await render(session(['lti-platforms:read', 'lti-platforms:edit']))
    expect(editLink(view)?.getAttribute('href')).toBe(`/admin/lti-platforms/${PLATFORM.id}/edit`)
  })

  test('shows no Edit button without lti-platforms:edit', async () => {
    const view = await render(session(['lti-platforms:read', 'lti-platforms:create']))
    expect(editLink(view)).toBeUndefined()
  })

  test('shows no Edit button without a session', async () => {
    const view = await render(null)
    expect(editLink(view)).toBeUndefined()
  })
})
