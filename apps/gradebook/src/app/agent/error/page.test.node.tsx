import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import AgentErrorPage from './page'

const render = async (code?: string | string[]) =>
  renderToStaticMarkup(await AgentErrorPage({ searchParams: Promise.resolve({ code }) }))

const SERVER_ERROR_MESSAGE = 'Something went wrong on our end.'
const INVALID_REQUEST_MESSAGE = 'This activity could not be connected to Modulus.'

describe('agent error page', () => {
  test.each([
    ['invalid_request', INVALID_REQUEST_MESSAGE],
    ['server_error', SERVER_ERROR_MESSAGE],
  ])('renders the message for %s', async (code, message) => {
    expect(await render(code)).toContain(message)
  })

  test('tells the learner their work will not be recorded', async () => {
    // The learner is about to keep working on a page that cannot report
    // progress. Saying so is the point of this slug.
    const markup = await render('invalid_request')

    expect(markup).toContain('will not be recorded')
    expect(markup).toContain('contact your instructor')
  })

  test.each([
    ['an unknown slug', 'not_a_slug'],
    ['an absent slug', undefined],
    ['a repeated slug', ['invalid_request', 'server_error']],
  ])('falls back to server_error for %s', async (_label, code) => {
    const markup = await render(code)

    expect(markup).toContain(SERVER_ERROR_MESSAGE)
    // An outage must never blame the learner's course link or send them to an
    // instructor who cannot help.
    expect(markup).not.toContain('contact your instructor')
  })

  test('never reflects the raw query value into the DOM', async () => {
    const markup = await render('<script>alert(1)</script>')

    expect(markup).not.toContain('alert(1)')
    expect(markup).not.toContain('script')
    expect(markup).toContain(SERVER_ERROR_MESSAGE)
  })

  test('renders no page content for a rejected redirect uri, and no link', async () => {
    // The non-reflection contract, as far as this component can carry it: a
    // value that failed validation never becomes page content or a link.
    //
    // This component is not the whole of that contract, and must not be
    // mistaken for it. Next serializes the request URL -- query string
    // included -- into the RSC flight payload (`self.__next_f`) of the served
    // HTML, so anything placed in `?code=` appears in the response whatever
    // this component does. Verified against a production build: requesting
    // `/agent/error?code=https%3A%2F%2Fevil.test%2F...` returns 200 with the
    // server_error copy, and the URI in the flight payload.
    //
    // The contract therefore rests on the redirecting route only ever sending
    // a fixed slug, never the rejected URI. That is Task 12's obligation and is
    // tested there.
    const rejected = 'https://evil.test/steal?token=secret-token-value#frag'

    const markup = await render(rejected)

    expect(markup).not.toContain('evil.test')
    expect(markup).not.toContain('secret-token-value')
    expect(markup).not.toContain('href')
    expect(markup).toContain(SERVER_ERROR_MESSAGE)
  })

  test('carries no diagnostic detail in any message', async () => {
    for (const code of ['invalid_request', 'server_error']) {
      const markup = await render(code)

      expect(markup).not.toContain('ERR_')
      expect(markup).not.toContain('Error:')
    }
  })
})
