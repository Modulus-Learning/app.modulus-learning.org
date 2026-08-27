import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import LtiErrorPage from './page'

const render = async (code?: string | string[]) =>
  renderToStaticMarkup(await LtiErrorPage({ searchParams: Promise.resolve({ code }) }))

const SERVER_ERROR_MESSAGE = 'Something went wrong on our end.'

describe('LTI error page', () => {
  test.each([
    ['invalid_request', 'The launch request was not valid.'],
    ['invalid_launch', 'This activity could not be launched.'],
    ['session_expired', 'Your launch could not be completed.'],
    ['server_error', SERVER_ERROR_MESSAGE],
  ])('renders the message for %s', async (code, message) => {
    expect(await render(code)).toContain(message)
  })

  test.each([
    ['an unknown slug', 'not_a_slug'],
    ['an absent slug', undefined],
    ['a repeated slug', ['invalid_launch', 'server_error']],
  ])('falls back to server_error for %s', async (_label, code) => {
    const markup = await render(code)

    expect(markup).toContain(SERVER_ERROR_MESSAGE)
    expect(markup).not.toContain('contact your instructor')
  })

  test('never reflects the raw query value into the DOM', async () => {
    const markup = await render('<script>alert(1)</script>')

    expect(markup).not.toContain('alert(1)')
    expect(markup).not.toContain('script')
    expect(markup).toContain(SERVER_ERROR_MESSAGE)
  })

  test('carries no diagnostic detail in any message', async () => {
    for (const code of ['invalid_request', 'invalid_launch', 'session_expired', 'server_error']) {
      const markup = await render(code)

      expect(markup).not.toContain('ERR_')
      expect(markup).not.toContain('Error:')
    }
  })
})
