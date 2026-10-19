import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ModulusAgentDeps, ModulusAgentImpl } from './agent.js'
import type { ApiClient, RejectedTarget } from './api-client.js'
import type { Logger } from './logger.js'
import type { User } from './types.js'

// These tests exercise the agent's authenticated request state machine (the
// retry/backoff/session-expiry/connection-lost behavior shared by progress and
// page-state submission and fetching) through the public surface, using the
// constructor's injectable collaborators to stand in for the real auth flow and
// API client.

const USER: User = { id: 'u1', full_name: 'Test User' }
const BASE_URL = 'https://gradebook.test'
const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'

type ClientResult = { status: string; [key: string]: unknown }
type MockClient = {
  getProgress: ReturnType<typeof vi.fn>
  putProgress: ReturnType<typeof vi.fn>
  getPageState: ReturnType<typeof vi.fn>
  putPageState: ReturnType<typeof vi.fn>
}

const okProgress = (progress = 0): ClientResult => ({ status: 'ok', data: { progress } })
// A 200 that completed the self high-water mark but refused one or more
// cumulative contribution targets.
const okProgressWithRejected = (progress: number, rejected: RejectedTarget[]): ClientResult => ({
  status: 'ok',
  data: { progress, rejected_targets: rejected },
})
const okPageState = (page_state: unknown = {}): ClientResult => ({
  status: 'ok',
  data: { page_state },
})

const makeClient = (over: Partial<MockClient> = {}): MockClient => ({
  getProgress: vi.fn(async () => okProgress(0)),
  putProgress: vi.fn(async () => okProgress(0)),
  getPageState: vi.fn(async () => okPageState()),
  putPageState: vi.fn(async () => ({ status: 'ok', data: {} })),
  ...over,
})

const AUTHENTICATED = {
  status: 'authenticated',
  baseUrl: BASE_URL,
  user: USER,
  token: 'tok',
  scope_id: SCOPE_ID,
  scope_name: 'Autumn 2026',
}

const makeAgent = (
  client: MockClient,
  auth: Awaited<ReturnType<ModulusAgentDeps['authenticate']>> = AUTHENTICATED as never,
  logger?: Logger
): ModulusAgentImpl => {
  const deps: ModulusAgentDeps = {
    authenticate: (async () => auth) as ModulusAgentDeps['authenticate'],
    createClient: () => client as unknown as ApiClient,
    ...(logger ? { logger } : {}),
  }
  return new ModulusAgentImpl(deps)
}

// A logger standing in for the `createConsoleLogger()` / `createDebugLogger()`
// an author opts into.  The agent's default is `createSilentLogger()`, so
// rejected targets are only observable to a caller who supplied one of these.
const makeRecordingLogger = (): { logger: Logger; calls: unknown[][] } => {
  const calls: unknown[][] = []
  return {
    calls,
    logger: {
      async log(...msgs: unknown[]) {
        calls.push(msgs)
      },
    },
  }
}

const ready = (agent: ModulusAgentImpl): Promise<void> =>
  new Promise((resolve) => agent.onReady(() => resolve()))

// Resolve once `event` fires (auto-unsubscribes).
const nextEvent = (agent: ModulusAgentImpl, event: string): Promise<void> =>
  new Promise((resolve) => {
    const off = agent.on(
      event as never,
      (() => {
        off()
        resolve()
      }) as never
    )
  })

describe('ModulusAgent authenticated request state machine', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes authenticated and loads initial progress from the server', async () => {
    const client = makeClient({ getProgress: vi.fn(async () => okProgress(0.4)) })
    const agent = makeAgent(client)
    await ready(agent)

    expect(agent.isAuthenticated()).toBe(true)
    expect(agent.isConnected()).toBe(true)
    expect(agent.progress()).toBe(0.4)
    expect(agent.submittedProgress()).toBe(0.4)
    expect(client.getProgress).toHaveBeenCalledTimes(1)
    expect(agent.authStatus()).toEqual({
      status: 'authenticated',
      user: USER,
      scope_id: SCOPE_ID,
      scope_name: 'Autumn 2026',
    })
  })

  it('maps an access_denied page-load result to the expired (signed-out) state', async () => {
    const client = makeClient()
    const agent = makeAgent(client, { status: 'expired' })
    await ready(agent)

    expect(agent.authStatus().status).toBe('expired')
    expect(agent.isAuthenticated()).toBe(false)
    expect(agent.isConnected()).toBe(false)
    expect(agent.lastError()?.type).toBe('session-expired')
    // We never authenticated, so no initial state is fetched.
    expect(client.getProgress).not.toHaveBeenCalled()
  })

  it('submits progress and emits progress-submitted on success', async () => {
    const client = makeClient({ putProgress: vi.fn(async () => okProgress(0.5)) })
    const agent = makeAgent(client)
    await ready(agent)

    const submitted = nextEvent(agent, 'progress-submitted')
    agent.setProgress(0.5)
    await submitted

    expect(agent.submittedProgress()).toBe(0.5)
    expect(agent.isConnected()).toBe(true)
    expect(client.putProgress).toHaveBeenCalledTimes(1)
  })

  it('maps a session-expired result to the expired state and emits session-expired', async () => {
    const client = makeClient({
      putProgress: vi.fn(async () => ({ status: 'session-expired', baseUrl: BASE_URL })),
    })
    const agent = makeAgent(client)
    await ready(agent)

    const expired = nextEvent(agent, 'session-expired')
    agent.setProgress(0.5)
    await expired

    expect(agent.authStatus().status).toBe('expired')
    expect(agent.isAuthenticated()).toBe(false)
    expect(agent.lastError()?.type).toBe('session-expired')
  })

  it('treats a non-401 client error as terminal, without retrying or losing the connection', async () => {
    const client = makeClient({
      putProgress: vi.fn(async () => ({ status: 'client-error', code: 400, text: 'bad' })),
    })
    const agent = makeAgent(client)
    await ready(agent)

    const errored = nextEvent(agent, 'error')
    agent.setProgress(0.5)
    await errored

    expect(agent.lastError()?.type).toBe('request-rejected')
    expect(agent.lastError()?.retriable).toBe(false)
    // Attempted exactly once -- no retries.
    expect(client.putProgress).toHaveBeenCalledTimes(1)
    // A request-level rejection is not a connectivity loss: the session stays
    // authenticated and connected.
    expect(agent.isConnectionLost()).toBe(false)
    expect(agent.isConnected()).toBe(true)
    expect(agent.isAuthenticated()).toBe(true)
  })

  it('retries a server error four times with backoff, then reports connection lost', async () => {
    const client = makeClient({
      putProgress: vi.fn(async () => ({ status: 'server-error', code: 500, text: 'boom' })),
    })
    const agent = makeAgent(client)
    await ready(agent)

    const attempts: number[] = []
    agent.on('retry', ((e: { attempt: number }) => attempts.push(e.attempt)) as never)
    const lost = nextEvent(agent, 'connection-lost')

    vi.useFakeTimers()
    agent.setProgress(0.5)
    await vi.advanceTimersByTimeAsync(20_000)
    await lost

    expect(agent.isConnectionLost()).toBe(true)
    expect(attempts).toEqual([1, 2, 3, 4])
    // one initial attempt + four retries
    expect(client.putProgress).toHaveBeenCalledTimes(5)
  })

  it('clears the connection-lost state when a later retry succeeds', async () => {
    let fail = true
    const client = makeClient({
      putProgress: vi.fn(async () =>
        fail ? { status: 'server-error', code: 500, text: 'x' } : okProgress(0.5)
      ),
    })
    const agent = makeAgent(client)
    await ready(agent)

    vi.useFakeTimers()
    const lost = nextEvent(agent, 'connection-lost')
    agent.setProgress(0.5)
    await vi.advanceTimersByTimeAsync(20_000)
    await lost
    expect(agent.isConnectionLost()).toBe(true)

    fail = false
    const restored = nextEvent(agent, 'connection-restored')
    await agent.retry()
    await restored

    expect(agent.isConnected()).toBe(true)
    expect(agent.submittedProgress()).toBe(0.5)
  })

  it('keeps a successful auth authenticated when initial state fails to load, and holds page-state writes', async () => {
    const client = makeClient({
      getProgress: vi.fn(async () => ({ status: 'client-error', code: 400, text: 'bad' })),
    })
    const agent = makeAgent(client)
    await ready(agent)

    // A failed initial fetch must not undo a successful authentication.
    expect(agent.authStatus().status).toBe('authenticated')
    expect(agent.isAuthenticated()).toBe(true)
    expect(agent.isInitialStateLoaded()).toBe(false)
    expect(agent.lastError()?.type).toBe('init-failed')

    // Progress and page-state writes are both held until the load failure is
    // resolved -- they never sync one-sidedly.
    agent.setProgress(0.5)
    agent.setPageState({ a: 1 })
    await Promise.resolve()
    expect(client.putProgress).not.toHaveBeenCalled()
    expect(client.putPageState).not.toHaveBeenCalled()
  })

  it('recovers via reloadInitialState() once the server responds', async () => {
    let fail = true
    const client = makeClient({
      getProgress: vi.fn(async () =>
        fail ? { status: 'client-error', code: 400, text: 'x' } : okProgress(0.6)
      ),
    })
    const agent = makeAgent(client)
    await ready(agent)
    expect(agent.isInitialStateLoaded()).toBe(false)

    fail = false
    await agent.reloadInitialState()

    expect(agent.isInitialStateLoaded()).toBe(true)
    expect(agent.progress()).toBe(0.6)

    // Page-state writes now go through.
    const submitted = nextEvent(agent, 'pagestate-submitted')
    agent.setPageState({ a: 1 })
    await submitted
    expect(client.putPageState).toHaveBeenCalled()
  })

  it('completes a submission that carries rejected cumulative targets', async () => {
    const rejected: RejectedTarget[] = [
      { url: 'https://elsewhere.test/umbrella', reason: 'activity_url_not_allowed' },
    ]
    const client = makeClient({
      putProgress: vi.fn(async () => okProgressWithRejected(0.5, rejected)),
    })
    const agent = makeAgent(client)
    await ready(agent)

    const submitted = nextEvent(agent, 'progress-submitted')
    agent.setProgress(0.5)
    await submitted

    // The server answered 200 with the self high-water mark committed, so the
    // submission is done: the progress is recorded as submitted, not held back
    // for another attempt.
    expect(agent.submittedProgress()).toBe(0.5)
    expect(agent.progress()).toBe(0.5)
    // Nothing is left outstanding, so the retry loop's `shouldRun` guard is
    // already false and the submission is not re-attempted.
    expect(client.putProgress).toHaveBeenCalledTimes(1)
    expect(agent.status().progress.retryAttempt).toBe(0)
  })

  it('logs rejected cumulative targets through an injected logger', async () => {
    const rejected: RejectedTarget[] = [
      { url: 'https://elsewhere.test/umbrella', reason: 'activity_url_not_allowed' },
      { url: 'not a url', reason: 'malformed_url' },
    ]
    const client = makeClient({
      putProgress: vi.fn(async () => okProgressWithRejected(0.5, rejected)),
    })
    const { logger, calls } = makeRecordingLogger()
    const agent = makeAgent(client, AUTHENTICATED as never, logger)
    await ready(agent)

    const submitted = nextEvent(agent, 'progress-submitted')
    agent.setProgress(0.5)
    await submitted

    const logged = calls.find((msgs) => msgs[1] === rejected)
    expect(logged).toBeDefined()
    expect(logged?.[0]).toContain('rejected')
  })

  it('does not retry or lose the connection over a rejected cumulative target', async () => {
    const client = makeClient({
      putProgress: vi.fn(async () =>
        okProgressWithRejected(0.5, [{ url: 'https://elsewhere.test/x', reason: 'self_reference' }])
      ),
    })
    const agent = makeAgent(client)
    await ready(agent)

    const retries: number[] = []
    agent.on('retry', ((e: { attempt: number }) => retries.push(e.attempt)) as never)
    const errors: unknown[] = []
    agent.on('error', ((e: unknown) => errors.push(e)) as never)
    let lost = false
    agent.on('connection-lost', (() => {
      lost = true
    }) as never)

    const submitted = nextEvent(agent, 'progress-submitted')
    agent.setProgress(0.5)
    await submitted

    // A durable authoring error is not a transient failure: one attempt, no
    // retry, no error event, and the connection stays up.
    expect(client.putProgress).toHaveBeenCalledTimes(1)
    expect(retries).toEqual([])
    expect(errors).toEqual([])
    expect(lost).toBe(false)
    expect(agent.isConnectionLost()).toBe(false)
    expect(agent.isConnected()).toBe(true)
    expect(agent.lastError()).toBeUndefined()
  })

  it('leaves a response without rejected targets behaving exactly as before', async () => {
    const client = makeClient({ putProgress: vi.fn(async () => okProgress(0.5)) })
    const { logger, calls } = makeRecordingLogger()
    const agent = makeAgent(client, AUTHENTICATED as never, logger)
    await ready(agent)

    const before = calls.length
    const submitted = nextEvent(agent, 'progress-submitted')
    agent.setProgress(0.5)
    await submitted

    expect(agent.submittedProgress()).toBe(0.5)
    expect(client.putProgress).toHaveBeenCalledTimes(1)
    // Nothing is logged when every target was accepted.
    expect(calls.slice(before)).toEqual([])
  })

  it('startFreshFromLocalState() overwrites the server with local page state and unblocks writes', async () => {
    const client = makeClient({
      getProgress: vi.fn(async () => ({ status: 'client-error', code: 400, text: 'x' })),
    })
    const agent = makeAgent(client)
    await ready(agent)
    expect(agent.isInitialStateLoaded()).toBe(false)

    const submitted = nextEvent(agent, 'pagestate-submitted')
    agent.startFreshFromLocalState()
    await submitted

    expect(agent.isInitialStateLoaded()).toBe(true)
    expect(client.putPageState).toHaveBeenCalled()
  })
})
