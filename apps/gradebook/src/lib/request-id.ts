import { v7 as uuidv7 } from 'uuid'

import { currentRequestId } from '@/lib/request-scope'

export const REQUEST_ID_HEADER = 'X-MODULUS-REQUEST-ID'

export const generateRequestID = () => uuidv7()

/** The current request's id, from the request scope (a fresh id outside one). */
export const getRequestId = async (): Promise<string> => currentRequestId()
