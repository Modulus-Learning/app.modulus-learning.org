import { createRouter } from '@tanstack/react-router'

import { modulusRouterOptions } from '@modulus-learning/host-tanstack-start/server/router-options'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({ routeTree, ...modulusRouterOptions() })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
