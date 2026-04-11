import type { CoreLogger, LogLevel, LogLevelWithSilent } from './logger.js'

export type ErrorReport = {
  code: string
  message: string
  details?: Record<string, unknown>
}

export type Ok<T> = { ok: true; data: T }
export type Err<E = ErrorReport> = { ok: false; error: E }
export type Result<T, E = ErrorReport> = Ok<T> | Err<E>

export const Result = {
  Ok: <T>(data: T): Ok<T> => ({ ok: true, data }),
  Err: <E = ErrorReport>(error: E): Err<E> => ({ ok: false, error }),
}

/// -----------------------------------------------

export type CoreErrorOptions = {
  // Short description of the error, for internal consumption
  message: string

  // Optional underlying cause (e.g. a 3rd-party error)
  cause?: unknown

  // Details to be included in the error report
  details?: Record<string, unknown>

  // If true, stack trace will be captured
  captureStack?: boolean

  // Log level for this error.  Defaults to 'error'.
  logLevel?: LogLevelWithSilent

  // Extra data to include only in logs
  logExtra?: Record<string, unknown>
}

// General purpose error class for standardizing logging and reporting of all
// kinds of errors.
export class CoreError extends Error {
  // Machine-readable error code.
  readonly code: string

  // Additional details about the error to be included in both error reports and logs.
  readonly details?: Record<string, unknown>

  // Extra values to include only when logging this error.
  readonly logExtra?: Record<string, unknown>

  // Level at which this error should be logged when caught.  Will always be
  // 'silent' if the error was logged when thrown.
  private logLevel: LogLevelWithSilent

  constructor(code: string, options: CoreErrorOptions, errorConstructor?: any) {
    const { message, cause, details, captureStack = false, logLevel = 'error', logExtra } = options

    // If Error.captureStackTrace is available, skip the default stack trace
    // generation (which would happen during the call to super()), and then
    // explicitly capture a stack trace _if_ captureStack is true _and_ logLevel
    // is not 'silent'.  The stack trace will omit errorConstructor and any
    // frames above it.
    if ('captureStackTrace' in Error) {
      const { stackTraceLimit } = Error
      Error.stackTraceLimit = 0
      super(message, { cause })
      Error.stackTraceLimit = stackTraceLimit
      if (captureStack && logLevel !== 'silent') {
        Error.captureStackTrace(this, errorConstructor ?? this.constructor)
      }
    } else {
      super(message, { cause })
    }

    this.code = code
    this.details = details
    this.logExtra = logExtra

    this.logLevel = logLevel

    // Mark these properties as non-enumerable, so they don't show up directly
    // in logs (i.e. so that pino doesn't serialize them as part of the error
    // itself).
    Object.defineProperties(this, {
      details: { enumerable: false },
      logLevel: { enumerable: false },
      logExtra: { enumerable: false },
    })
  }

  log(logger: CoreLogger): typeof this {
    if (this.logLevel !== 'silent') {
      logger.log(this.logLevel, { err: this, ...this.details, ...this.logExtra })
      this.logLevel = 'silent'
    }

    return this
  }

  report(): ErrorReport {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export const createCoreErrorType = (code: string, logLevel: LogLevel = 'error') => {
  const cons = (opts: CoreErrorOptions, errorConstructor?: any) =>
    new CoreError(code, { logLevel, ...opts }, errorConstructor ?? cons)
  return cons
}

export const ErrorCodes = {
  UNHANDLED: 'ERR_UNHANDLED',
  DATABASE: 'ERR_DATABASE',
  ASSERTION: 'ERR_ASSERTION',
  NOT_FOUND: 'ERR_NOT_FOUND',
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  VALIDATION: 'ERR_VALIDATION',
  OUTPUT_VALIDATION: 'ERR_OUTPUT_VALIDATION',
  FORBIDDEN: 'ERR_FORBIDDEN',
  VERSION_CONFLICT: 'ERR_VERSION_CONFLICT',
  UNIQUE_CONSTRAINT: 'ERR_UNIQUE_CONSTRAINT',
} as const

export const ERR_UNHANDLED = createCoreErrorType(ErrorCodes.UNHANDLED)
export const ERR_DATABASE = createCoreErrorType(ErrorCodes.DATABASE)
export const ERR_ASSERTION = createCoreErrorType(ErrorCodes.ASSERTION)
export const ERR_NOT_FOUND = createCoreErrorType(ErrorCodes.NOT_FOUND, 'warn')
export const ERR_UNAUTHORIZED = createCoreErrorType(ErrorCodes.UNAUTHORIZED, 'warn')
export const ERR_FORBIDDEN = createCoreErrorType(ErrorCodes.FORBIDDEN, 'warn')
export const ERR_VALIDATION = createCoreErrorType(ErrorCodes.VALIDATION, 'warn')
export const ERR_VERSION_CONFLICT = createCoreErrorType(ErrorCodes.VERSION_CONFLICT, 'warn')
export const ERR_UNIQUE_CONSTRAINT = createCoreErrorType(ErrorCodes.UNIQUE_CONSTRAINT, 'warn')
