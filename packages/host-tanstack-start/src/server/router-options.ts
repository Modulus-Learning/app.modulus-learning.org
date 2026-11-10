import { createIsomorphicFn } from '@tanstack/react-start'

import { localeInputRewrite, localeOutputRewrite } from '@/i18n/locale-rewrite'

// The per-request CSP nonce lives in the server request scope (set by the CSP
// middleware in `modulusStartOptions`). It is read through the scope's global
// symbol so this isomorphic module never imports server-only code; on the
// client the router reads the nonce from `<meta property="csp-nonce">` itself.
const getSsrNonce = createIsomorphicFn()
  .server((): string | undefined => {
    const storage = (globalThis as Record<symbol, unknown>)[Symbol.for('modulus.requestScope')] as
      | { getStore(): { nonce?: string } | undefined }
      | undefined
    return storage?.getStore()?.nonce
  })
  .client(() => undefined)

/**
 * The router options every Modulus host uses. The host's `src/router.tsx`
 * keeps `createRouter` and its own generated route tree:
 *
 *   createRouter({ routeTree, ...modulusRouterOptions() })
 */
export const modulusRouterOptions = () => {
  const nonce = getSsrNonce()
  return {
    // Isomorphic locale rewrite (spec: Internationalisation): `input` makes
    // the matcher always see a locale segment on localizable paths; `output`
    // strips only the default locale, so `en` URLs stay clean.
    rewrite: {
      input: ({ url }: { url: URL }) => localeInputRewrite(url),
      output: ({ url }: { url: URL }) => localeOutputRewrite(url),
    },
    scrollRestoration: true,
    defaultPreload: 'intent' as const,
    ...(nonce != null ? { ssr: { nonce } } : {}),
  }
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Which theme palette the document uses (see `data-theme-context`). */
    themeContext?: 'public' | 'protected'
    /** `chromeless` documents (LTI, agent, renewal) render no app chrome. */
    chrome?: 'full' | 'chromeless'
  }
}
