import type { z } from 'zod'

import { CoreError, type CoreErrorOptions, ERR_DATABASE, type Err, Result } from '@/lib/errors.js'
import { type CoreLogger, type LogLevelWithSilent, withLogContext } from './logger.js'
import type { AdminAuth, AgentAuth, UserAuth } from './auth.js'
import type { WithOptional } from './type-utils.js'

// The different authorization modes supported by commands.
type AuthMode = 'none' | 'user' | 'admin' | 'agent'

// Type map -- defines the config that must be supplied when defining a command
// depending on its auth mode.
type AuthConfig = {
  none: { mode: 'none' }
  user: { mode: 'user'; abilities: string[] }
  admin: { mode: 'admin'; abilities: string[] }
  agent: { mode: 'agent' }
}

// Basic request context, common to all commands.
export interface RequestContext {
  requestId: string
}

// Context for commands requiring an authenticated user.
export interface UserRequestContext extends RequestContext {
  userAuth: UserAuth
}

// Context for commands requiring an authenticated admin user.
export interface AdminRequestContext extends RequestContext {
  adminAuth: AdminAuth
}

// Context for commands requiring an authenticated agent user.
export interface AgentRequestContext extends RequestContext {
  agentAuth: AgentAuth
}

// The configuration object used to define a command.  This is the argument to
// CoreUtils.createCommand().  Consists of a method name, auth config,
// input/output schemas, and a handler function (whose arguments and return type
// depend on the auth mode and schemas).
export type CommandConfig<Mode extends AuthMode, Name extends string, InSchema, OutSchema> = {
  method: Name
  auth: AuthConfig[Mode]
  schemas: {
    input: InSchema
    output: OutSchema
  }
  handler: (...args: HandlerArgs<z.output<InSchema>>[Mode]) => Promise<z.input<OutSchema>>
}

// A command object, which is a callable function, annotated with some
// additional metadata including a method name, auth config and input/output
// schemas.  The function signature depends on the auth mode and schemas, and
// wraps the handler function provided in the CommandConfig with additional
// logic for logging, error handling, and input/output validation.
export type Command<Mode extends AuthMode, Name extends string, InSchema, OutSchema> = {
  method: Name
  auth: AuthConfig[Mode]
  schemas: {
    input: InSchema
    output: OutSchema
  }
} & ((
  ctx: RequestContextType[Mode],
  input: z.input<InSchema>
) => Promise<Result<z.output<OutSchema>>>)

// Type map -- defines the request context required for a command based on its
// auth mode.
type RequestContextType = {
  none: RequestContext
  user: UserRequestContext
  admin: AdminRequestContext
  agent: AgentRequestContext
}

// Type map -- defines the shape of the arguments accepted by a command's
// handler function, based on the auth mode.
type HandlerArgs<In> = {
  none: [input: In]
  user: [userAuth: UserAuth, input: In]
  admin: [adminAuth: AdminAuth, input: In]
  agent: [agentAuth: AgentAuth, input: In]
}

// Internal helper that prepares the base log context for a command invocation
// (the data that's included in every log message emitted while handling the
// command), based on the auth mode and request context.
const prepareLogContext = (command: string, authMode: AuthMode, ctx: any) => {
  const logContext: Record<string, unknown> = {
    request_id: ctx.requestId,
    command,
  }

  if (authMode === 'agent') {
    logContext.user_id = ctx.agentAuth.user_id
  } else if (authMode === 'user') {
    logContext.user_id = ctx.userAuth.id
  } else if (authMode === 'admin') {
    logContext.admin_id = ctx.adminAuth.id
  }

  return logContext
}

// Internal helper that passes the appropriate arguments to a command handler
// function, based on the auth mode.
const callHandler = (
  handler: (...args: any[]) => Promise<any>,
  input: any,
  mode: AuthMode,
  ctx: any
) => {
  switch (mode) {
    case 'none':
      return handler(input)
    case 'user':
      return handler(ctx.userAuth, input)
    case 'admin':
      return handler(ctx.adminAuth, input)
    case 'agent':
      return handler(ctx.agentAuth, input)
  }
}

export class CoreUtils {
  private logger: CoreLogger

  constructor(deps: { logger: CoreLogger }) {
    this.logger = deps.logger
  }

  createCommand<
    Mode extends AuthMode,
    Name extends string,
    InSchema extends z.ZodType,
    OutSchema extends z.ZodType,
  >({
    method,
    auth,
    schemas,
    handler,
  }: CommandConfig<Mode, Name, InSchema, OutSchema> & { auth: { mode: Mode } }): Command<
    Mode,
    Name,
    InSchema,
    OutSchema
  > {
    const wrappedHandler = (ctx: RequestContextType[Mode], input: z.input<InSchema>) =>
      withLogContext(prepareLogContext(method, auth.mode, ctx), async () => {
        const start = performance.now()
        this.logger.debug('request')

        try {
          // Check permissions first.  This will throw if the required abilities are not claimed.
          if (auth.mode === 'user') {
            ;(ctx as RequestContextType['user']).userAuth.assertAbilities(
              (auth as AuthConfig['user']).abilities
            )
          } else if (auth.mode === 'admin') {
            ;(ctx as RequestContextType['admin']).adminAuth.assertAdminAbilities(
              (auth as AuthConfig['admin']).abilities
            )
          }

          // TODO: Make this validation optional / runtime configurable?
          const validatedInput = this.zodParse(input, schemas.input, {
            message: 'input validation failed',
          })

          const output = await callHandler(handler, validatedInput, auth.mode, ctx)

          // TODO: Make this validation optional / runtime configurable?
          const validatedOutput = this.zodParse(output, schemas.output, {
            code: 'ERR_OUTPUT_VALIDATION',
            message: 'output validation failed',
            logLevel: 'error',
          })

          const end = performance.now()
          this.logger.info({ elapsed: end - start, status: 'success' }, 'response')

          return Result.Ok(validatedOutput)
        } catch (error) {
          const report = this.reportError(error)

          const end = performance.now()
          this.logger.info(
            { elapsed: end - start, status: 'fail', code: report.error.code },
            'response'
          )

          return report
        }
      })

    return Object.assign(wrappedHandler, {
      method,
      auth,
      schemas,
    })
  }

  /**
   * Converts an error into a Result.Err variant.
   *
   * This method is intended to be called inside a top-level catch block, to
   * convert errors into Results.  If the error is NOT a CoreError it will be
   * logged -- this is based on the assumption that CoreErrors will be logged
   * (if needed) when they are initially thrown.
   *
   * @param {unknown} error The error value.
   * @param {string} method The name of the method containing the catch block.
   */
  reportError(error: unknown): Err {
    if (error instanceof CoreError) {
      error.log(this.logger)
      return Result.Err(error.report())
    }
    this.logger.error({ err: error, unhandled: true })
    return Result.Err({ code: 'ERR_UNHANDLED', message: 'an unexpected error occurred' })
  }

  /**
   * Logs an arbitrary error and rethrows it as a CoreError
   */
  wrapError(code: string, opts: Omit<CoreErrorOptions, 'cause'>): (cause: unknown) => never {
    const wrapper = (cause: unknown) => {
      throw new CoreError(code, { ...opts, cause }, wrapper)
    }

    return wrapper
  }

  /**
   * Helper to logs a database error and rethrow it as a CoreError.
   */
  wrapDbErrorNew = (
    opts: WithOptional<Omit<CoreErrorOptions, 'cause' | 'captureStack'>, 'message'> = {}
  ) => {
    const wrapper = (cause: unknown) => {
      const { message = 'database error', ...rest } = opts
      throw ERR_DATABASE({ message, cause, ...rest }, wrapper).log(this.logger)
    }

    return wrapper
  }

  /**
   * Logs a database error and rethrows it as a CoreError.
   */
  wrapDbError(method: string, logLevel: LogLevelWithSilent = 'error') {
    const wrapper = (cause: unknown) => {
      throw ERR_DATABASE({ message: `database error in ${method}`, cause, logLevel }, wrapper).log(
        this.logger
      )
    }

    return wrapper
  }

  zodParse<T extends z.ZodType>(
    data: unknown,
    schema: T,
    {
      code = 'ERR_VALIDATION',
      message = 'validation failed',
      logLevel = 'warn',
      details,
      ...opts
    }: { code?: string } & WithOptional<Omit<CoreErrorOptions, 'cause'>, 'message'> = {}
  ): z.infer<T> {
    const result = schema.safeParse(data)
    if (result.success) {
      return result.data
    }
    throw new CoreError(code, {
      ...opts,
      message,
      details: { ...details, issues: result.error.issues },
      logLevel,
    }).log(this.logger)
  }

  /**
   * Throws an assertion error if the given condition is not met.
   */
  assert(
    condition: any,
    { code = 'ERR_ASSERTION', ...opts }: { code?: string } & Omit<CoreErrorOptions, 'cause'>
  ): asserts condition {
    if (!condition) {
      throw new CoreError(code, opts).log(this.logger)
    }
  }

  /**
   * Throws an assertion error if the given value is undefined or null.
   */
  assertExists<T>(
    value: T,
    { code = 'ERR_ASSERTION', ...opts }: { code?: string } & Omit<CoreErrorOptions, 'cause'>
  ): asserts value is NonNullable<T> {
    if (value == null) {
      throw new CoreError(code, opts).log(this.logger)
    }
  }
}

export function cached<This, T>(target: (this: This) => T, { kind, name }: DecoratorContext) {
  if (kind === 'getter') {
    return function (this: This) {
      const result = target.call(this)
      Object.defineProperty(this, name, { value: result, writable: false })
      return result
    }
  }
}

export const arrayContentsMatch = <T>(array1?: T[], array2?: T[], transform?: (val: T) => T) => {
  // If both are undefined, they match
  if (array1 == null && array2 == null) return true

  // If one is undefined and the other isn't, they are different.  TODO: This
  // feels wrong: what if one is undefined and the other is empty?
  if (array1 == null || array2 == null) return false

  // If lengths are different, they are different
  if (array1.length !== array2.length) return false

  // If one (hence both) have length 0, they match
  if (array1.length === 0) return true

  const set1 = new Set(transform == null ? array1 : array1.map(transform))
  const arr2 = transform == null ? array2 : array2.map(transform)

  return arr2.every((val) => set1.has(val))
}

// /**
//  * Wraps, logs, and rethrows a 3rd-party error as a CoreError.
//  *
//  * Example:
//  * ```typescript
//  *   someFunction().catch(this.wrapError('ERR_SOME_ERROR_CODE', opts))
//  * ```
//  */
// export const wrapError = (
//   logger: CoreLogger,
//   code: string,
//   opts: Omit<CoreErrorOptions, 'cause'>
// ) => {
//   const wrapper = (cause: unknown) => {
//     throw new CoreError(code, { ...opts, cause }, wrapper).log(logger)
//   }

//   return wrapper
// }

// /**
//  * Helper to logs a database error and rethrow it as a CoreError.
//  */
// export const wrapDbError = (
//   logger: CoreLogger,
//   opts: WithOptional<Omit<CoreErrorOptions, 'cause' | 'captureStack'>, 'message'> = {}
// ) => {
//   const wrapper = (cause: unknown) => {
//     const { message = 'database error', ...rest } = opts
//     throw ERR_DATABASE({ message, cause, ...rest }, wrapper).log(logger)
//   }

//   return wrapper
// }

// /**
//  * Throws an assertion error if the given condition is not met.
//  */
// export function assert(
//   condition: any,
//   logger: CoreLogger,
//   { code = 'ERR_ASSERTION', ...opts }: { code?: string } & Omit<CoreErrorOptions, 'cause'>
// ): asserts condition {
//   if (!condition) {
//     throw new CoreError(code, opts).log(logger)
//   }
// }

// /**
//  * Throws an assertion error if the given value is undefined or null.
//  */
// export function assertExists<T>(
//   value: T,
//   logger: CoreLogger,
//   { code = 'ERR_ASSERTION', ...opts }: { code?: string } & Omit<CoreErrorOptions, 'cause'>
// ): asserts value is NonNullable<T> {
//   if (value == null) {
//     throw new CoreError(code, opts).log(logger)
//   }
// }
