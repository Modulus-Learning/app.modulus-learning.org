import type { ProxyLayer } from './@types'

export const withPrefersColorScheme: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const response = await next(request, event, context)
    response.headers.set('Accept-CH', 'Sec-CH-Prefers-Color-Scheme')
    response.headers.set('Vary', 'Sec-CH-Prefers-Color-Scheme')
    response.headers.set('Critical-CH', 'Sec-CH-Prefers-Color-Scheme')
    return response
  }
}
