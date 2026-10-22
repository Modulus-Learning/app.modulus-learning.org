import type { DeploymentMode } from '@/lib/deployment-mode'
import type { RequestScope } from '@/lib/request-scope'

/**
 * One structured line per request (spec: Request Logging). Never carries a
 * query string, body, cookie, `Authorization` header or user identity; the
 * route is the matched route id when known, otherwise the bare pathname.
 */
export interface AccessLogLine {
  request_id: string
  method: string
  route: string
  status: number
  duration_ms: number
  handler_type: NonNullable<RequestScope['log']['handlerType']>
  server_fn?: string
  mode: DeploymentMode
}

const MAX_ROUTE_LENGTH = 256

/** Health probes would drown the log. */
const SKIPPED_PATHS = new Set(['/routes/elb-status', '/routes/keep-alive'])

export const shouldLogRequest = (pathname: string): boolean => !SKIPPED_PATHS.has(pathname)

export const buildAccessLogLine = (args: {
  scope: RequestScope
  method: string
  pathname: string
  status: number
  mode: DeploymentMode
  now?: number
}): AccessLogLine => {
  const { scope, method, pathname, status, mode, now = Date.now() } = args
  const line: AccessLogLine = {
    request_id: scope.requestId,
    method,
    route: (scope.log.route ?? pathname).slice(0, MAX_ROUTE_LENGTH),
    status,
    duration_ms: now - scope.startedAt,
    handler_type: scope.log.handlerType ?? 'entry',
    mode,
  }
  if (scope.log.serverFn != null) line.server_fn = scope.log.serverFn
  return line
}

export const accessLogLevel = (status: number): 'info' | 'warn' | 'error' =>
  status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
