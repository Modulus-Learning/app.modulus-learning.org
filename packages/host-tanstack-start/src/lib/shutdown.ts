import type { StopHandle } from '@modulus-learning/core'

/**
 * Background jobs and graceful shutdown for the TanStack Start host (spec:
 * Deployment Modes item 5, Task 17). Kept free of Start and config imports so
 * the sequence can be exercised directly in tests; `src/server.ts` wires it.
 *
 * Nitro's node preset closes the HTTP server on `SIGTERM`/`SIGINT` (within
 * `SERVER_SHUTDOWN_TIMEOUT`) but never calls `process.exit`. This module owns
 * process exit: it stops claiming job work, awaits the core `StopHandle`, waits
 * for in-flight requests to finish, then exits — or exits at the hard deadline,
 * leaving any unfinished line item leased until another worker reclaims it.
 */

export interface ShutdownLogger {
  info(line: object, message: string): void
  error(line: object, message: string): void
}

/**
 * Counts requests the entry pipeline is still handling. A request settles once
 * its HTTP response has been fully written to the socket or its connection has
 * closed (`settleOnTransport` in `@/lib/entry`), so exit never cuts off a
 * response — streamed, backpressured or bodyless.
 */
export interface InFlightTracker {
  /** Marks a request as started; call the returned function when it settles. */
  begin(): () => void
  readonly count: number
  /** Resolves once no request is in flight. */
  idle(): Promise<void>
}

export const createInFlightTracker = (): InFlightTracker => {
  let count = 0
  let waiters: Array<() => void> = []
  return {
    begin() {
      count++
      let settled = false
      return () => {
        if (settled) return
        settled = true
        count--
        if (count === 0) {
          for (const resolve of waiters) resolve()
          waiters = []
        }
      }
    },
    get count() {
      return count
    },
    idle() {
      return count === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve))
    },
  }
}

// HMR re-evaluates `src/server.ts` in development; the guard keeps one set of
// worker loops and one set of signal handlers per process.
const JOBS = Symbol.for('modulus.backgroundJobs')
const SIGNALS = Symbol.for('modulus.shutdownSignals')

type GuardedGlobal = typeof globalThis & {
  [JOBS]?: Promise<StopHandle>
  [SIGNALS]?: boolean
}

/** Starts the background jobs once per process and returns their stop handle. */
export const startBackgroundJobsOnce = (start: () => Promise<StopHandle>): Promise<StopHandle> => {
  const guarded = globalThis as GuardedGlobal
  guarded[JOBS] ??= start()
  return guarded[JOBS]
}

export interface ShutdownOptions {
  stopJobs: StopHandle
  inFlight: InFlightTracker
  /** Hard deadline for the whole drain (`SHUTDOWN_DRAIN_SECONDS`). */
  deadlineMs: number
  logger: ShutdownLogger
  exit: (code: number) => void
}

/**
 * Returns the shutdown sequence. Idempotent: a second signal while draining
 * joins the first drain rather than starting another.
 */
export const createShutdown = (options: ShutdownOptions) => {
  let running: Promise<void> | undefined
  return (signal: string): Promise<void> => {
    running ??= drain(options, signal)
    return running
  }
}

const drain = async (options: ShutdownOptions, signal: string): Promise<void> => {
  const { stopJobs, inFlight, deadlineMs, logger, exit } = options
  const startedAt = Date.now()
  logger.info(
    { signal, deadlineSeconds: deadlineMs / 1000, inFlight: inFlight.count },
    'shutdown: draining background jobs and in-flight requests'
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>((resolve) => {
    timer = setTimeout(() => resolve('deadline'), deadlineMs)
  })
  const drained = (async () => {
    await stopJobs()
    await inFlight.idle()
    return 'drained' as const
  })()

  try {
    const outcome = await Promise.race([drained, deadline])
    if (outcome === 'deadline') {
      logger.error(
        { signal, deadlineSeconds: deadlineMs / 1000, inFlight: inFlight.count },
        'shutdown: drain deadline reached; exiting with work unfinished (leased line items are reclaimed once their lease expires)'
      )
      exit(1)
      return
    }
    logger.info({ signal, durationMs: Date.now() - startedAt }, 'shutdown: drained')
    exit(0)
  } catch (error) {
    logger.error({ signal, err: error }, 'shutdown: background job drain failed')
    exit(1)
  } finally {
    clearTimeout(timer)
  }
}

export interface SignalSource {
  once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
}

/** Installs the shutdown sequence on `SIGTERM`/`SIGINT`, once per process. */
export const installShutdownSignals = (
  shutdown: (signal: string) => Promise<void>,
  source: SignalSource = process
): void => {
  const guarded = globalThis as GuardedGlobal
  if (guarded[SIGNALS]) return
  guarded[SIGNALS] = true
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    source.once(signal, () => void shutdown(signal))
  }
}

/** Seconds of headroom the drain deadline keeps beyond a submission's request timeout. */
export const DRAIN_MARGIN_SECONDS = 10

/**
 * The boot warning for a drain deadline too short to let an in-flight score
 * submission finish within its request timeout; `null` when the chain is sound.
 */
export const drainDeadlineWarning = (
  drainSeconds: number,
  requestTimeoutSeconds: number
): string | null =>
  requestTimeoutSeconds + DRAIN_MARGIN_SECONDS > drainSeconds
    ? `SHUTDOWN_DRAIN_SECONDS (${drainSeconds}) leaves less than ${DRAIN_MARGIN_SECONDS}s beyond the score-submission request timeout (${requestTimeoutSeconds}s); a rolling deploy may cut a submission off`
    : null
