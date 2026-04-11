import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  Level as PinoLevel,
  LevelWithSilent as PinoLevelWithSilent,
  Logger as PinoLogger,
} from 'pino'

//
// Context for logging, stored in an AsyncLocalStorage
//
export interface LogContext {
  // Top-level
  command?: string
  request_id?: string

  // Auth
  user_id?: string
  admin_id?: string

  // Call-site
  domain?: string
  module?: string
  class?: string
  method?: string
}

const logContextStore = new AsyncLocalStorage<LogContext>()
export const getLogContext = () => logContextStore.getStore() ?? {}
export const withLogContext = <T>(context: LogContext, fn: () => T): T => {
  return logContextStore.run({ ...getLogContext(), ...context }, fn)
}

//
// Core logger types and interfaces
//
export type LogLevel = PinoLevel
export type LogLevelWithSilent = PinoLevelWithSilent

export type LogData = Record<string, unknown>

type LogFnArgs =
  | [message: string, ...args: unknown[]]
  | [data: LogData, message?: string, ...args: unknown[]]

export interface CoreLogger {
  log(level: LogLevel, ...args: LogFnArgs): void
  fatal(...args: LogFnArgs): void
  error(...args: LogFnArgs): void
  warn(...args: LogFnArgs): void
  info(...args: LogFnArgs): void
  debug(...args: LogFnArgs): void
  trace(...args: LogFnArgs): void
  silent(...args: LogFnArgs): void
}

export const createCoreLogger = (deps: { pinoLogger: PinoLogger }): CoreLogger => {
  return new CoreLoggerImpl(deps.pinoLogger)
}

class CoreLoggerImpl implements CoreLogger {
  constructor(private pinoLogger: PinoLogger) {}

  child(bindings: LogData): CoreLogger {
    return new CoreLoggerImpl(this.pinoLogger.child(bindings))
  }

  log(level: LogLevel, ...[first, second, ...rest]: LogFnArgs): void {
    if (typeof first === 'string') {
      // args have shape [string, ...unknown[]]
      this.pinoLogger[level](getLogContext(), first, second, ...rest)
    } else {
      // Treat err field specially if present.  Other values, if present, go
      // into extra.
      const { err, ...data } = first
      const extra = Object.keys(data).length > 0 ? data : undefined
      if (typeof second === 'string') {
        // args have shape [LogData, string, ...unknown[]]
        this.pinoLogger[level]({ ...getLogContext(), extra, err }, second, ...rest)
      } else {
        // args have shape [LogData]
        this.pinoLogger[level]({ ...getLogContext(), extra, err })
      }
    }
  }

  fatal(...args: LogFnArgs): void {
    this.log('fatal', ...args)
  }

  error(...args: LogFnArgs): void {
    this.log('error', ...args)
  }

  warn(...args: LogFnArgs): void {
    this.log('warn', ...args)
  }

  info(...args: LogFnArgs): void {
    this.log('info', ...args)
  }

  debug(...args: LogFnArgs): void {
    this.log('debug', ...args)
  }

  trace(...args: LogFnArgs): void {
    this.log('trace', ...args)
  }

  silent(..._args: LogFnArgs): void {}
}
