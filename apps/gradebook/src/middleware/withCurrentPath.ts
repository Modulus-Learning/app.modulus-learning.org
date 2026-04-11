import type { ProxyLayer } from './@types'

export const withCurrentPath: ProxyLayer = (next) => {
  return async (request, event, context) => {
    request.headers.set('X-Current-Path', request.nextUrl.pathname)
    return next(request, event, context)
  }
}
