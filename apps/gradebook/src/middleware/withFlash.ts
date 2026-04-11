import { getServerConfig } from '@/config'
import type { ProxyLayer } from './@types'

export const withFlash: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const config = getServerConfig()
    const flashCookie = request.cookies.get(config.cookies.flash.name)
    if (flashCookie != null) {
      const response = await next(request, event, context)
      // NOT sure if this is needed as the cookie is set to
      // expires 0
      request.cookies.delete(config.cookies.flash.name)
      response.headers.set('x-flash-message', flashCookie.value)
      return response
    }
    return next(request, event, context)
  }
}
