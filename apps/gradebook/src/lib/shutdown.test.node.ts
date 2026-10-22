import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  createInFlightTracker,
  createShutdown,
  drainDeadlineWarning,
  installShutdownSignals,
  startBackgroundJobsOnce,
} from './shutdown'

const logger = () => ({ info: vi.fn(), error: vi.fn() })

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('modulus.backgroundJobs')]
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('modulus.shutdownSignals')]
})

describe('createShutdown', () => {
  test('a stop handle that completes → drains and exits 0', async () => {
    const exit = vi.fn()
    const stopJobs = vi.fn().mockResolvedValue(undefined)
    const shutdown = createShutdown({
      stopJobs,
      inFlight: createInFlightTracker(),
      deadlineMs: 70_000,
      logger: logger(),
      exit,
    })
    await shutdown('SIGTERM')
    expect(stopJobs).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
  })

  test('a stop handle that hangs past the deadline → exits 1 at the deadline', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const log = logger()
    const shutdown = createShutdown({
      stopJobs: () => new Promise(() => {}),
      inFlight: createInFlightTracker(),
      deadlineMs: 70_000,
      logger: log,
      exit,
    })
    const done = shutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(69_999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineSeconds: 70 }),
      expect.stringMatching(/deadline reached/)
    )
  })

  test('a stop handle that throws → logs and exits 1', async () => {
    const exit = vi.fn()
    const log = logger()
    const shutdown = createShutdown({
      stopJobs: () => Promise.reject(new Error('boom')),
      inFlight: createInFlightTracker(),
      deadlineMs: 70_000,
      logger: log,
      exit,
    })
    await shutdown('SIGTERM')
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringMatching(/drain failed/)
    )
  })

  test('waits for in-flight requests after the jobs stop', async () => {
    const exit = vi.fn()
    const inFlight = createInFlightTracker()
    const settle = inFlight.begin()
    const shutdown = createShutdown({
      stopJobs: () => Promise.resolve(),
      inFlight,
      deadlineMs: 70_000,
      logger: logger(),
      exit,
    })
    const done = shutdown('SIGTERM')
    await new Promise((resolve) => setImmediate(resolve))
    expect(exit).not.toHaveBeenCalled()
    settle()
    await done
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
  })

  test('a second signal joins the running drain', async () => {
    const exit = vi.fn()
    const stopJobs = vi.fn().mockResolvedValue(undefined)
    const shutdown = createShutdown({
      stopJobs,
      inFlight: createInFlightTracker(),
      deadlineMs: 70_000,
      logger: logger(),
      exit,
    })
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')])
    expect(stopJobs).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
  })
})

describe('createInFlightTracker', () => {
  test('counts requests and resolves idle at zero; settling twice is harmless', async () => {
    const tracker = createInFlightTracker()
    const a = tracker.begin()
    const b = tracker.begin()
    expect(tracker.count).toBe(2)
    const idle = vi.fn()
    void tracker.idle().then(idle)
    a()
    a()
    await Promise.resolve()
    expect(tracker.count).toBe(1)
    expect(idle).not.toHaveBeenCalled()
    b()
    await Promise.resolve()
    expect(tracker.count).toBe(0)
    expect(idle).toHaveBeenCalledOnce()
  })
})

describe('process guards', () => {
  test('starts background jobs once per process', async () => {
    const stop = vi.fn()
    const start = vi.fn().mockResolvedValue(stop)
    expect(await startBackgroundJobsOnce(start)).toBe(stop)
    expect(await startBackgroundJobsOnce(start)).toBe(stop)
    expect(start).toHaveBeenCalledOnce()
  })

  test('installs SIGTERM and SIGINT once per process', () => {
    const once = vi.fn()
    const shutdown = vi.fn().mockResolvedValue(undefined)
    installShutdownSignals(shutdown, { once })
    installShutdownSignals(shutdown, { once })
    expect(once.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGINT'])
    once.mock.calls[0]?.[1]()
    expect(shutdown).toHaveBeenCalledWith('SIGTERM')
  })
})

describe('drainDeadlineWarning', () => {
  test('the defaults (70s drain, 60s request timeout) are sound', () => {
    expect(drainDeadlineWarning(70, 60)).toBeNull()
  })

  test('a drain deadline inside the request timeout plus margin warns', () => {
    expect(drainDeadlineWarning(65, 60)).toMatch(/SHUTDOWN_DRAIN_SECONDS \(65\)/)
  })
})
