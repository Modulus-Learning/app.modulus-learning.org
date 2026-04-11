// https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy

import { getCSPHeader, getServerConfig } from '@/config'
import type { ProxyLayer } from './@types'

export const withCSP: ProxyLayer = (next) => {
  const config = getServerConfig()

  return async (request, event, context) => {
    if (config.cspEnabled && request.headers.get('x-nonce') != null) {
      const nonce = request.headers.get('x-nonce')
      const cspHeader = getCSPHeader(nonce)
      // TODO: Should this be set on the request?
      request.headers.set('Content-Security-Policy', cspHeader)
      const response = await next(request, event, context)
      response.headers.set('Content-Security-Policy', cspHeader)
      return response
    }
    return next(request, event, context)
  }
}
