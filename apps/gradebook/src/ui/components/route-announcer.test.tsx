import { act, createElement } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'

import { RouteAnnouncer } from './route-announcer'

// Accessibility audit finding 9: client navigation must be announced.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.title = ''
})

const setup = () => {
  const rootRoute = createRootRoute({
    component: () =>
      createElement('div', null, createElement(Outlet), createElement(RouteAnnouncer)),
  })
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => createElement('h1', null, 'Home'),
  })
  const about = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: () => createElement('h1', null, 'About Modulus'),
  })
  return createRouter({
    routeTree: rootRoute.addChildren([home, about]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

const mount = async (router: ReturnType<typeof setup>) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(RouterProvider, { router }))
  })
  await act(async () => {
    await router.load()
  })
}

const announcement = () => document.getElementById('route-announcer')

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 80)))

describe('RouteAnnouncer', () => {
  test('announces nothing on the initial load', async () => {
    await mount(setup())
    await settle()
    expect(announcement()?.textContent).toBe('')
    expect(announcement()?.getAttribute('aria-live')).toBe('assertive')
  })

  test('announces the new document title after a client navigation', async () => {
    const router = setup()
    await mount(router)
    await act(async () => {
      document.title = 'Modulus - About'
      await router.navigate({ href: '/about' })
    })
    await settle()
    expect(announcement()?.textContent).toBe('Modulus - About')
  })

  test('falls back to the page heading when there is no title', async () => {
    const router = setup()
    await mount(router)
    await act(async () => {
      await router.navigate({ href: '/about' })
    })
    await settle()
    expect(announcement()?.textContent).toBe('About Modulus')
  })
})
