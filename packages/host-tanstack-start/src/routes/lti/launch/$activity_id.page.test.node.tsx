import { createElement } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

// Ported from PR #9's Next.js page test. The interstitial's link is built
// from the resolved activity row, so the page's own construction is only
// observable by rendering it.

const mocks = vi.hoisted(() => ({ loaderData: undefined as unknown }))

vi.mock('@tanstack/react-router', () => ({
  useLoaderData: () => mocks.loaderData,
}))
// The launch component is a stand-in that exposes the destination it is given
// as an anchor; how it renders that link is covered by its own tests.
vi.mock('@/modules/lti/components/lti-launch-activity', () => ({
  LtiLaunchActivity: ({ destination }: { destination: string }) =>
    createElement('a', { href: destination }, 'Launch'),
}))

import { selectLaunchDestination } from '@/modules/lti/launch-destination'
import { Page } from './$activity_id.page'

const activityId = '019c2d8e-9f01-7a4e-9c2f-2b7c1d9a5e11'
const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const modulusServerUrl = 'https://modulus.test'

const renderWith = (activityUrl: string): string => {
  mocks.loaderData = {
    kind: 'result',
    session: null,
    result: {
      status: 'success',
      data: {
        activity: { id: activityId, url: activityUrl, name: 'Lesson' },
        modulus_server_url: modulusServerUrl,
        scope_id: scopeId,
        scope_name: null,
      },
    },
  }
  return renderToStaticMarkup(createElement(Page))
}

const launchHref = (markup: string): string => {
  const match = /<a href="([^"]+)"/.exec(markup)
  expect(match).not.toBeNull()
  return (match?.[1] ?? '').replaceAll('&amp;', '&')
}

describe('LTI launch interstitial', () => {
  test('links to the stored canonical URL with only the two transport parameters', () => {
    // Stored activity URLs carry no query or fragment, and a non-root trailing
    // slash is part of identity.
    const stored = 'https://content.test/a%20b/lesson/'
    const href = launchHref(renderWith(stored))

    expect(href).toBe(
      `https://content.test/a%20b/lesson/?modulus=${encodeURIComponent(modulusServerUrl)}&scope_id=${scopeId}`
    )

    const destination = new URL(href)
    expect(destination.origin + destination.pathname).toBe(stored)
    expect([...destination.searchParams.keys()].toSorted()).toEqual(['modulus', 'scope_id'])
    expect(destination.hash).toBe('')

    // An immediate launch (`never` mode) for the same resolved activity must
    // land on exactly the page the interstitial links to.
    expect(href).toBe(
      selectLaunchDestination({
        mode: 'never',
        activityId,
        activityUrl: stored,
        scopeId,
        modulusServerUrl,
      })
    )
  })
})
