import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'

import { v7 as uuidv7 } from 'uuid'

export const REQUEST_ID_HEADER = 'X-MODULUS-REQUEST-ID'

export const generateRequestID = () => uuidv7()

/**
 * getRequestId
 *
 * Returns the current requestId as set by the withRequestId middleware.  This
 * can be called in middleware _after_ the withRequestId middleware (by passing
 * in the current NextRequest object), or in any page / server action / route
 * handler (by leaving request undefined).
 *
 * If the withRequestId middleware hasn't been called, this will just generate
 * a random UUIDv7 each time it is called.
 *
 * @param request
 * @returns
 */
export const getRequestId = async (request?: NextRequest | undefined): Promise<string> => {
  const headerSet = request ? request.headers : await headers()
  return headerSet.get(REQUEST_ID_HEADER) ?? generateRequestID()
}
