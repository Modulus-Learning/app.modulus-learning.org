import { pathWithoutLocale } from '@/i18n/utils'
import { accessLogLevel, buildAccessLogLine, shouldLogRequest } from '@/lib/access-log'
import { type DeploymentMode, isRouteAllowed } from '@/lib/deployment-mode'
import { createRequestScope, runInRequestScope } from '@/lib/request-scope'
import type { InFlightTracker } from '@/lib/shutdown'

/**
 * The server-entry request pipeline for the TanStack Start host, kept free of
 * Start imports so it can be exercised directly in tests. `src/server.ts`
 * wires it to `handler.fetch`.
 *
 * Order (spec: Request lifecycle mapping): open the request scope → access
 * log wrapper → admin apex redirect → deployment-mode gate → activity
 * redirect → locale negotiation (Task 9) → router. Early responses produced
 * here are logged like any other.
 */

export interface EntryLogger {
  info(line: object, message: string): void
  warn(line: object, message: string): void
  error(line: object, message: string): void
}

export interface EntryOptions {
  mode: DeploymentMode
  logger: EntryLogger
  /** Locale negotiation slot; Task 9 supplies the implementation. */
  negotiateLocale?: (request: Request) => Response | null
  /** Counts requests still being handled, so shutdown can wait for them. */
  inFlight?: InFlightTracker
}

// Matches http(s) with one or two slashes after the scheme; Next collapsed `//`
// before its proxy ran, Start does not, so both shapes are recognised.
const ACTIVITY_PATH = /\/https?:\/\/?/

export const activityRedirect = (url: URL): Response | null => {
  if (!ACTIVITY_PATH.test(url.pathname) || url.pathname.startsWith('/start-activity')) {
    return null
  }
  return Response.redirect(new URL(`/start-activity${url.pathname}`, url), 307)
}

const notFound = () => new Response('Not Found', { status: 404 })

export const createEntryHandler =
  (options: EntryOptions, next: (request: Request) => Promise<Response>) =>
  (request: Request): Promise<Response> => {
    const scope = createRequestScope()
    const settle = options.inFlight?.begin()
    // On Node, the request settles when its HTTP response is fully written (or
    // the connection closes) — the transport, not the handler, decides.
    const transportSettled = settle != null && settleOnTransport(request, settle)
    return runInRequestScope(scope, async () => {
      const url = new URL(request.url)
      let response: Response
      try {
        response = await route(request, url, options, next)
      } catch (error) {
        if (!(error instanceof Response)) {
          if (!transportSettled) settle?.()
          log(options, scope, request.method, url.pathname, 500)
          throw error
        }
        response = error
      }
      log(options, scope, request.method, url.pathname, response.status)
      const rewritten = relativeSameOriginRedirect(response, url)
      return transportSettled ? rewritten : settleWithBody(rewritten, settle)
    })
  }

/** The Node.js response srvx attaches to each request it creates, if any. */
type NodeResponseLike = {
  closed?: boolean
  once(event: 'close', listener: () => void): unknown
}

const nodeResponseOf = (request: Request): NodeResponseLike | null => {
  const res = (request as { runtime?: { node?: { res?: Partial<NodeResponseLike> } } }).runtime
    ?.node?.res
  return res != null && typeof res.once === 'function' ? (res as NodeResponseLike) : null
}

/**
 * Settles the request when its Node.js response closes: `close` fires after
 * the last buffered byte has been flushed to the socket, or when the client
 * disconnects. This holds under backpressure — a stream can reach its end
 * while the adapter is still writing — and covers bodyless responses too.
 * Returns false when no Node response is attached (an internal request, a
 * test), so the caller falls back to tracking the body.
 */
export const settleOnTransport = (request: Request, settle: () => void): boolean => {
  const res = nodeResponseOf(request)
  if (res == null) return false
  if (res.closed) settle()
  else res.once('close', settle)
  return true
}

/**
 * The fallback for a request with no Node response attached (an internal
 * request, a test): the body is re-wrapped so the request settles when the
 * stream ends, errors, or is cancelled. A response without a body settles at
 * once. Real HTTP requests use `settleOnTransport` instead.
 */
export const settleWithBody = (response: Response, settle?: () => void): Response => {
  if (settle == null) return response
  if (response.body == null) {
    settle()
    return response
  }
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          settle()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        settle()
        controller.error(error)
      }
    },
    cancel(reason) {
      settle()
      return reader.cancel(reason)
    },
  })
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Rewrites a redirect to this request's own origin into a relative Location.
 * Node sees the request as the proxy forwards it (`http://`, nginx's Host), so
 * an absolute same-origin URL built from `request.url` would name the wrong
 * scheme behind a TLS edge, or drop the port locally. A relative Location
 * resolves against the URL the browser actually used.
 */
export const relativeSameOriginRedirect = (response: Response, url: URL): Response => {
  const location = response.headers.get('location')
  if (location == null || response.status < 300 || response.status >= 400) return response
  const target = new URL(location, url)
  if (target.origin !== url.origin) return response
  // `Response.redirect` headers are immutable; rebuild rather than mutate.
  const headers = new Headers(response.headers)
  headers.set('location', `${target.pathname}${target.search}${target.hash}`)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const route = async (
  request: Request,
  url: URL,
  options: EntryOptions,
  next: (request: Request) => Promise<Response>
): Promise<Response> => {
  const { mode } = options

  // An admin instance has no learner home page; send the apex to sign-in.
  if (mode === 'admin' && pathWithoutLocale(url.pathname) === '/') {
    return Response.redirect(new URL('/admin/sign-in', url), 307)
  }

  // The gate reads only the URL, so a blocked request's body is never read.
  if (!isRouteAllowed(mode, url.pathname)) {
    return notFound()
  }

  const activity = activityRedirect(url)
  if (activity != null) return activity

  const locale = options.negotiateLocale?.(request)
  if (locale != null) return locale

  return next(request)
}

const log = (
  options: EntryOptions,
  scope: ReturnType<typeof createRequestScope>,
  method: string,
  pathname: string,
  status: number
) => {
  if (!shouldLogRequest(pathname)) return
  const line = buildAccessLogLine({ scope, method, pathname, status, mode: options.mode })
  options.logger[accessLogLevel(status)](line, 'request')
}
