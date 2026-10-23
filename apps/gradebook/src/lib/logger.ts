import type { Logger } from 'pino'

import { currentRequestId } from '@/lib/request-scope'
import { getServerLogger } from '@/lib/server-logger'

/** The process logger (see `@/lib/server-logger`). Server-only. */
export const getLogger = (): Logger => getServerLogger()

/** A child logger carrying the current request's id. */
export const getRequestLogger = async (): Promise<Logger> =>
  getServerLogger().child({ requestId: currentRequestId() })
