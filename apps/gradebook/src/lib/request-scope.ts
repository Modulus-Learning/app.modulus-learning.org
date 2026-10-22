import { AsyncLocalStorage } from 'node:async_hooks'

import { v7 as uuidv7 } from 'uuid'

/**
 * Per-request state for the TanStack Start host, opened by the server entry
 * around the whole request (see `@/lib/entry`). Server-only.
 *
 * - `requestId` — UUIDv7, generated per request (never taken from the client),
 *   shared by the access log line and every core log line for the request.
 * - `log` — the access-log record; request middleware and server-function
 *   factories annotate it, the entry wrapper emits it once.
 * - `nonce` / `flash` — set by request middleware for the render to read.
 */
export interface RequestScope {
  requestId: string
  startedAt: number
  log: AccessLogAnnotations
  nonce?: string
  flash?: string
}

export interface AccessLogAnnotations {
  handlerType?: 'entry' | 'ssr' | 'serverFn' | 'handler'
  /** Matched route id, when the router handled the request. */
  route?: string
  /** Server-function variable name, from Start's `serverFnMeta` (see `src/start.ts`). */
  serverFn?: string
}

/**
 * Registered on `globalThis` under a well-known symbol so isomorphic code (the
 * router's SSR nonce, see `src/router.tsx`) can read the current scope without
 * importing this server-only module into the client bundle.
 */
export const REQUEST_SCOPE_KEY = Symbol.for('modulus.requestScope')

const storage: AsyncLocalStorage<RequestScope> =
  ((globalThis as Record<symbol, unknown>)[REQUEST_SCOPE_KEY] as AsyncLocalStorage<RequestScope>) ??
  new AsyncLocalStorage<RequestScope>()
;(globalThis as Record<symbol, unknown>)[REQUEST_SCOPE_KEY] = storage

export const createRequestScope = (now: number = Date.now()): RequestScope => ({
  requestId: uuidv7(),
  startedAt: now,
  log: {},
})

export const runInRequestScope = <T>(scope: RequestScope, fn: () => T): T => storage.run(scope, fn)

/** The current request's scope, or undefined outside a request (jobs, scripts, tests). */
export const getRequestScope = (): RequestScope | undefined => storage.getStore()

/** The current request id, or a fresh one outside a request. */
export const currentRequestId = (): string => getRequestScope()?.requestId ?? uuidv7()

export const annotateRequest = (annotations: AccessLogAnnotations): void => {
  const scope = getRequestScope()
  if (scope != null) Object.assign(scope.log, annotations)
}
