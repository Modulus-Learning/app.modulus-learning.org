import { createCsrfMiddleware, createMiddleware } from '@tanstack/react-start'
import { deleteCookie, getCookie, setResponseHeader } from '@tanstack/react-start/server'

import { getServerConfig } from '@/config/index'
import { cspHeaderFor, generateNonce } from '@/lib/csp-policy'
import { annotateRequest, getRequestScope } from '@/lib/request-scope'

/**
 * TanStack Start instance configuration (spec: Request lifecycle mapping).
 *
 * Request middleware, in order:
 *  1. CSRF — Start's built-in check, on server-function requests only.
 *  2. Request kind — records, server-side, whether this is an SSR page, a
 *     `/routes/*` handler or a server function (a client header can never claim
 *     a kind), and annotates the access-log record (see `@/lib/entry`).
 *  3. Flash — reads the one-shot flash cookie into the request scope for the
 *     render to show, and clears it.
 *  4. CSP — per-request nonce and header, when CSP is enabled.
 *
 * No session refresh happens here: request handling only ever verifies
 * credentials (spec: Authentication And Sessions).
 */

// Browsers send `Sec-Fetch-Site`, which Start checks first. Without it, Start
// falls back to comparing `Origin` with the request URL, which behind nginx
// and a TLS edge is `http://` and the proxied host; compare with the public
// origin the instance is configured to serve instead.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
  origin: (origin) => origin === new URL(getServerConfig().publicServerUrl).origin,
})

const requestKindMiddleware = createMiddleware().server(
  ({ next, pathname, handlerType, serverFnMeta }) => {
    if (handlerType === 'serverFn') {
      annotateRequest({ handlerType: 'serverFn', serverFn: serverFnMeta?.name })
    } else {
      annotateRequest({ handlerType: pathname.startsWith('/routes/') ? 'handler' : 'ssr' })
    }
    return next()
  }
)

const flashMiddleware = createMiddleware().server(({ next, handlerType }) => {
  if (handlerType === 'router') {
    const { name } = getServerConfig().cookies.flash
    const flash = getCookie(name)
    if (flash != null) {
      const scope = getRequestScope()
      if (scope != null) scope.flash = flash
      deleteCookie(name, { path: '/' })
    }
  }
  return next()
})

const cspMiddleware = createMiddleware().server(({ next, pathname, handlerType }) => {
  if (handlerType === 'router' && getServerConfig().cspEnabled) {
    const nonce = generateNonce()
    const header = cspHeaderFor(pathname, nonce)
    if (header != null) {
      const scope = getRequestScope()
      if (scope != null) scope.nonce = nonce
      setResponseHeader('Content-Security-Policy', header)
    }
  }
  return next()
})

/**
 * The Start options every Modulus host uses. The host's `src/start.ts` keeps
 * the literal call Start requires:
 *
 *   export const startInstance = createStart(() => modulusStartOptions())
 */
export const modulusStartOptions = () => ({
  requestMiddleware: [csrfMiddleware, requestKindMiddleware, flashMiddleware, cspMiddleware],
})
