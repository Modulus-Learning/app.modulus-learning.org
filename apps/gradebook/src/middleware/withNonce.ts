import type { ProxyLayer } from './@types'

export const withNonce: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
    request.headers.set('x-nonce', nonce)
    return next(request, event, context)
  }
}
