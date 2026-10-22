import { createRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

import { routeTree } from './routeTree.gen'

// The per-request CSP nonce lives in the server request scope (set by the CSP
// middleware in `src/start.ts`). It is read through the scope's global symbol
// so this isomorphic module never imports server-only code; on the client the
// router reads the nonce from `<meta property="csp-nonce">` itself.
const getSsrNonce = createIsomorphicFn()
  .server((): string | undefined => {
    const storage = (globalThis as Record<symbol, unknown>)[Symbol.for('modulus.requestScope')] as
      | { getStore(): { nonce?: string } | undefined }
      | undefined
    return storage?.getStore()?.nonce
  })
  .client(() => undefined)

export function getRouter() {
  const nonce = getSsrNonce()
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    ...(nonce != null ? { ssr: { nonce } } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
