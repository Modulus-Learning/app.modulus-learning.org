import { generateRequestID, REQUEST_ID_HEADER } from '@/lib/request-id'
import type { ProxyLayer } from './@types'

export const withRequestId: ProxyLayer = (next) => {
  return async (request, event, context) => {
    request.headers.set(REQUEST_ID_HEADER, generateRequestID())
    return next(request, event, context)
  }
}
