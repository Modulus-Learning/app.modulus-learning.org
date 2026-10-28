import pino, { type Logger } from 'pino'

import { getServerConfig } from '@/config'

/**
 * The TanStack Start host's pino logger. Server-only; it replaces the Next
 * `@/lib/logger`, which reads request ids through `next/headers`. Production
 * output is JSON to stdout; `LOG_PRETTY=true` is for local development only.
 */
let logger: Logger | undefined

export const getServerLogger = (): Logger => {
  if (logger == null) {
    const { log } = getServerConfig()
    logger = pino({
      level: log.level ?? 'info',
      ...(log.pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    })
  }
  return logger
}
