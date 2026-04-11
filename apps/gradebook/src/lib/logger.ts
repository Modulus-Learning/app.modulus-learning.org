// TODO: refactor our singletons to use some sort of container
// or context - like https://github.com/jeffijoe/awilix

import type { NextRequest } from 'next/server'

import logger, { type Logger } from 'pino'

import { getServerConfig } from '@/config'
import { getRequestId } from './request-id'

// TODO: Don't set global.logger
let cached = (global as any).logger

export const getLogger = (): Logger => {
  if (cached == null) {
    // TODO: Default log level should be info?
    cached = (global as any).logger = logger({ level: getServerConfig().log.level ?? 'debug' })
    return cached
  }
  return cached
}

export const getRequestLogger = async (request?: NextRequest): Promise<Logger> => {
  const requestId = await getRequestId(request)
  return getLogger().child({ requestId })
}
