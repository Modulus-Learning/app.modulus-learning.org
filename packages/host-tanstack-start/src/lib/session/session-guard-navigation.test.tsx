import { act, createElement } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from '@tanstack/react-router'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { resolveGuardedSession } from './route-guard'
import { SessionGuardError } from './session-retry'
import type { RenewalOutcome } from './renewal'

// Client navigation into a protected layout whose access token has expired
// but whose refresh cookie remains (review R3). The guard is the one the real
// `_auth` / `_authed` layouts use, wired the same way: a transient renewal
// failure renders the manual retry, a terminal one redirects to sign-in.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

const session = { user: { id: 'u1' } }

const setup = (renewals: RenewalOutcome[]) => {
  let signedIn = false
  const load = vi.fn(async () =>
    signedIn ? { session, renewable: false } : { session: null, renewable: true }
  )
  const renew = vi.fn(async () => {
    const outcome = renewals.shift() ?? { status: 'terminal' as const }
    if (outcome.status === 'renewed') signedIn = true
    return outcome
  })

  const rootRoute = createRootRoute({ component: () => createElement(Outlet) })
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => createElement('p', null, 'home'),
  })
  const signIn = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => createElement('p', null, 'sign in'),
  })
  const protectedLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: 'protected',
    beforeLoad: async () => {
      const decision = await resolveGuardedSession({ domain: 'user', load, renew, isServer: false })
      if (decision.kind !== 'session') throw redirect({ href: '/sign-in' })
      return { session: decision.session }
    },
    errorComponent: SessionGuardError,
    component: () => createElement(Outlet),
  })
  const dashboard = createRoute({
    getParentRoute: () => protectedLayout,
    path: '/dashboard',
    component: () => createElement('p', null, 'dashboard'),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([home, signIn, protectedLayout.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { router, renew, load }
}

const mount = async (router: ReturnType<typeof setup>['router']) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(RouterProvider, { router }))
  })
  await act(async () => {
    await router.load()
  })
  return () => container?.textContent ?? ''
}

const navigateTo = async (router: ReturnType<typeof setup>['router'], to: string) => {
  await act(async () => {
    await router.navigate({ to })
  })
}

describe('protected layout on client navigation, expired access token', () => {
  test('a transient renewal failure renders the manual retry, not sign-in', async () => {
    const { router, renew } = setup([{ status: 'transient' }])
    const text = await mount(router)
    await navigateTo(router, '/dashboard')

    expect(text()).toContain("We couldn't restore your session")
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(renew).toHaveBeenCalledOnce()
  })

  test('"Try again" renews once more and, on success, shows the page', async () => {
    const { router, renew } = setup([
      { status: 'transient' },
      { status: 'renewed', principal: { domain: 'user', userId: 'u1' } },
    ])
    const text = await mount(router)
    await navigateTo(router, '/dashboard')

    const retry = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Try again'
    )
    await act(async () => {
      retry?.click()
    })
    await act(async () => {
      await router.load()
    })

    expect(text()).toContain('dashboard')
    expect(renew).toHaveBeenCalledTimes(2)
  })

  test('a terminal renewal failure redirects to sign-in', async () => {
    const { router, renew } = setup([{ status: 'terminal' }])
    const text = await mount(router)
    await navigateTo(router, '/dashboard')

    expect(router.state.location.pathname).toBe('/sign-in')
    expect(text()).toContain('sign in')
    expect(renew).toHaveBeenCalledOnce()
  })
})
