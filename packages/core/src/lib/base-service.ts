import { type CoreLogger, type LogContext, withLogContext } from '@/lib/logger.js'

type ServiceMetadata = {
  domain: string
  module: string
  class: string
}

// Unique symbol for service metadata field, to avoid conflicts with fields
// defined in subclasses.
const serviceMetaSymbol = Symbol('serviceMeta')

/**
 * Base class for all services in the system.
 *
 * The main purpose of this class is to provide consistent logging context for
 * all services, by adding domain, module, class and method fields to log
 * messages generated inside methods annotated with the `@method` decorator.
 *
 * Note: the `logContext` method is `protected` so that it can be overridden if
 * needed in subclasses (which should generally call `super.logContext` to
 * include the base context fields).
 */
export class BaseService {
  private readonly [serviceMetaSymbol]: ServiceMetadata
  protected readonly logger: CoreLogger

  constructor(logger: CoreLogger, domain: string, module: string) {
    this.logger = logger
    this[serviceMetaSymbol] = {
      domain,
      module,
      class: this.constructor.name,
    }
  }

  /**
   * Returns logging context/metadata for the given method name.
   */
  protected logContext(method: string): LogContext {
    return { ...this[serviceMetaSymbol], method }
  }
}

/**
 * Method decorator that adds logging context to the decorated method.  This is
 * only usable on methods of classes extending `BaseService`.
 *
 * This also logs method entry and exit at the `trace` level.
 */
export function method<
  This extends BaseService,
  Target extends (this: This, ...args: any[]) => any,
>(target: Target, context: ClassMethodDecoratorContext<This, Target>) {
  // TODO: add a parameter to control whether entry/exit logging is done, and at
  // what log level?
  const methodName = String(context.name)
  return function (this: This, ...args: Parameters<Target>): ReturnType<Target> {
    return withLogContext(this.logContext(methodName), () => {
      this.logger.trace('enter')
      try {
        const result = target.apply(this, args)

        if (result instanceof Promise) {
          return result.finally(() => {
            this.logger.trace('exit')
          })
        }

        this.logger.trace('exit')
        return result
      } catch (err) {
        this.logger.trace('exit')
        throw err
      }
    })
  } as Target
}
