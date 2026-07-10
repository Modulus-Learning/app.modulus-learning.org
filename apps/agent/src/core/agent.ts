import { ApiClient, type ApiRequestResult, type ProgressContribution } from './api-client.js'
import { authenticate } from './auth.js'
import { EventEmitter } from './event-emitter.js'
import { createSilentLogger, type Logger } from './logger.js'
import type {
  AgentError,
  AuthStatus,
  ContributionTarget,
  ModulusAgentEvents,
  ReadyEvent,
  User,
} from './types.js'

// Agent's (internal) authentication state.
type AuthState =
  | { status: 'none' }
  | { status: 'authenticated'; user: User; client: ApiClient; connectionLost: boolean }
  | { status: 'failed'; baseUrl?: string | undefined; error: string }
  | { status: 'expired'; baseUrl?: string }

// The dependencies the agent needs to run: its logger and the collaborators for
// authentication and API access.  `createModulusAgent` wires in the real
// implementations; this package's own tests construct `ModulusAgentImpl`
// directly with fakes to drive the agent through its authentication and request
// paths without a live server or browser redirect.
export interface ModulusAgentDeps {
  logger?: Logger
  authenticate: typeof authenticate
  createClient: (baseUrl: string, token: string) => ApiClient
}

// The agent implementation.  This class is not part of the package's public
// API -- callers construct an agent with `createModulusAgent` and refer to it by
// the `ModulusAgent` type (both exported below).  It is exported from this
// module only so that this package's tests can construct it directly with
// substituted collaborators; the package entry (./index.ts) does not re-export
// it, and the package `exports` map blocks deep imports.
export class ModulusAgentImpl extends EventEmitter<ModulusAgentEvents> {
  // ********************** TOP-LEVEL STATE **********************

  // Has the Modulus agent finished initializing itself?
  #ready = false

  // The current authentication state.
  #auth: AuthState = { status: 'none' }

  // Last error emitted, if any.
  #lastError: AgentError | undefined = undefined

  // Optional logger.
  #logger?: Logger

  // Injectable collaborators (see ModulusAgentDeps).
  #authenticate: ModulusAgentDeps['authenticate']
  #createClient: ModulusAgentDeps['createClient']

  // ********************** PROGRESS *****************************

  // High-water mark progress.  Will be equal to the saved progress, except
  // while a submission is in flight.
  #progress = 0

  // Highest progress value that has been successfully sent to or received from
  // the Modulus API.
  #submittedProgress = 0

  // Whether a progress submission is currently in flight.
  #submittingProgress = false

  // Track retry attempts
  #progressRetryAttempt = 0

  // Cumulative ("accumulator") activities this one contributes a calculation of
  // its own progress to.  Each registered target adds an extra entry to every
  // progress submission.
  #contributionTargets: ContributionTarget[] = []

  // ********************** PAGESTATE ****************************

  // Current (local) page state.
  #pageState: any = {}

  // Whether the current (local) page state matches the last value sent to or received
  // from the Modulus API.
  #pageStateInSync = true

  // Whether a page state submission is currently in flight.
  #submittingPageState = false

  // Track retry attempts
  #pageStateRetryAttempt = 0

  // ********************** Initialization ***********************

  // Construct the agent with its dependencies supplied explicitly.  Callers use
  // `createModulusAgent`, which passes the real implementations; tests pass fakes.
  constructor(deps: ModulusAgentDeps) {
    super()
    this.#logger = deps.logger ?? createSilentLogger()
    this.#authenticate = deps.authenticate
    this.#createClient = deps.createClient
    this.#initialize()
  }

  // Convenience method -- unlike agent.on('ready') or agent.once('ready'), this
  // method ensures that the callback will be called even if the agent is
  // already ready when the callback is registered.
  onReady(callback: (event: ReadyEvent) => void) {
    if (this.isReady()) {
      callback({ auth: this.authStatus() })
    } else {
      this.once('ready', callback)
    }
  }

  // ********************** Current agent state ******************

  // Has the agent finished initializing?
  isReady(): boolean {
    return this.#ready
  }

  // Did the agent successfully authenticate with a Modulus server during
  // initialization?
  isAuthenticated(): boolean {
    return this.#auth.status === 'authenticated'
  }

  // Get the authenticated user's info, if available.
  user(): User | undefined {
    return this.#auth.status === 'authenticated' ? this.#auth.user : undefined
  }

  // Current authentication status, including user info if authenticated and
  // error code if authentication failed.
  authStatus(): AuthStatus {
    if (this.#auth.status === 'authenticated') {
      return {
        status: 'authenticated',
        user: this.#auth.user,
      }
    }
    if (this.#auth.status === 'failed') {
      return {
        status: 'failed',
        error: this.#auth.error,
      }
    }
    if (this.#auth.status === 'expired') {
      return {
        status: 'expired',
      }
    }
    return {
      status: 'none',
    }
  }

  // Is the agent currently connected to the Modulus server?  This will be true
  // when the agent is authenticated, and there are no ongoing connection
  // issues.
  isConnected(): boolean {
    return this.#auth.status === 'authenticated' && this.#auth.connectionLost === false
  }

  // Has the agent lost its connection to the Modulus server (hopefully
  // temporarily)?  Indicates that the agent is authenticated, but there are
  // ongoing connection issues (i.e. API requests have been failing).
  isConnectionLost(): boolean {
    return this.#auth.status === 'authenticated' && this.#auth.connectionLost
  }

  // Get the progress value for the current page.
  progress(): number {
    return this.#progress
  }

  // Fetch progress for a set of *other* activity URLs -- e.g. a cumulative page
  // reading the activities that report into it.  Returns one entry per URL the
  // server resolved and authorized (URLs that don't exist or that fall outside
  // the current activity's scope are omitted).  Best-effort: resolves to an
  // empty array if the agent isn't authenticated or the request fails.
  async getProgressFor(urls: string[]): Promise<{ url: string; progress: number }[]> {
    if (this.#auth.status !== 'authenticated' || urls.length === 0) {
      return []
    }

    const result = await this.#auth.client.getProgress(urls)
    if (result.status === 'ok') {
      return result.data.others ?? []
    }

    await this.#logger?.log('Failed to fetch progress for urls', { status: result.status })
    return []
  }

  // Get the last progress value that was successfully submitted to (or received
  // from) the Modulus API.
  submittedProgress(): number {
    return this.#submittedProgress
  }

  // Get the current page state.
  pageState(): any {
    return this.#pageState
  }

  // Get the most recent error, if any.
  lastError(): AgentError | undefined {
    return this.#lastError
  }

  // Return the full status of the agent.  Mostly useful for debugging /
  // testing.
  status() {
    return {
      authenticated: this.#auth.status === 'authenticated',
      authStatus: this.authStatus(),
      connectionLost: this.isConnectionLost(),
      progress: {
        current: this.#progress,
        submitted: this.#submittedProgress,
        submitting: this.#submittingProgress,
        retryAttempt: this.#progressRetryAttempt,
      },
      pageState: {
        current: this.#pageState,
        inSync: this.#pageStateInSync,
        submitting: this.#submittingPageState,
        retryAttempt: this.#pageStateRetryAttempt,
      },
      lastError: this.#lastError,
    }
  }

  // ********************** State update methods ***********************

  // Set the progress value for the current page.  Must be a number between 0
  // and 1.  If this value is smaller than the current progress, it will be
  // silently ignored.  If the agent is currently connected to a Modulus server,
  // this will submit the progress (in the background).
  setProgress(progress: number) {
    if (this.isReady() === false) {
      throw new Error('Cannot set progress before Modulus agent is ready')
    }

    if (progress > 1.0 || progress < 0.0) {
      throw new Error('Invalid progress value: must be between 0.0 and 1.0')
    }

    // TODO: Should we issue a warning if progress <= this.#progress?
    if (progress > this.#progress) {
      // TODO: Store progress in local storage?
      this.#progress = progress
      this.emit('progress-changed', { progress })
      this.#submitProgress()
    }
  }

  // Register a cumulative ("accumulator") activity that this activity contributes
  // a calculation of its own progress to.  Once registered, every progress
  // submission additionally reports `factor` for the target url, and the server
  // applies `Δself × factor` to it.  Returns a function that removes the
  // registration (e.g. for use as a React effect cleanup).
  addContributionTarget(target: ContributionTarget): () => void {
    this.#contributionTargets.push(target)
    return () => {
      const index = this.#contributionTargets.indexOf(target)
      if (index !== -1) {
        this.#contributionTargets.splice(index, 1)
      }
    }
  }

  // Build the cumulative contribution targets for a submission: one entry per
  // registered target, carrying the contribution `factor`.  The server derives
  // each increment from the observed change in self's high-water mark.
  #buildContributions(): ProgressContribution[] {
    return this.#contributionTargets.map((target) => ({
      url: target.url,
      factor: target.factor,
    }))
  }

  // Set the page state for the current page.  Any JSON-serializable value is
  // allowed. If the agent is currently connected to a Modulus server, this will
  // submit the page state (in the background).
  setPageState(pageState: any) {
    if (this.isReady() === false) {
      throw new Error('Cannot set page state before Modulus agent is ready')
    }

    // TODO: Deep equality check, or possibly allow for patching as opposed to
    // full replacement?
    if (this.#pageState !== pageState) {
      this.#pageState = pageState
      this.#pageStateInSync = false
      this.emit('pagestate-changed', { pageState })
      this.#submitPageState()
    }
  }

  // Attempt to re-submit progress and/or page state if the connection to the
  // Modulus server is currently lost.  If successful, the connectionLost status
  // will be cleared, and the 'connection-restored' event will be emitted.
  async retry() {
    if (this.isConnectionLost()) {
      await this.#submitProgress()
      await this.#submitPageState()
    }
  }

  // ********************** Internal methods ***********************

  async #submitProgress() {
    if (this.#submittingProgress || this.#auth.status !== 'authenticated') {
      return
    }

    this.#submittingProgress = true

    try {
      await this.#submitProgressInner()
    } finally {
      this.#submittingProgress = false
    }
  }

  async #submitPageState() {
    if (this.#submittingPageState || this.#auth.status !== 'authenticated') {
      return
    }

    this.#submittingPageState = true

    try {
      await this.#submitPageStateInner()
    } finally {
      this.#submittingPageState = false
    }
  }

  async #submitProgressInner(): Promise<boolean> {
    return this.#runWithRetry({
      context: 'progress',
      verb: 'submit',
      shouldRun: () => this.#progress > this.#submittedProgress,
      call: (client) => client.putProgress(this.#progress, this.#buildContributions()),
      onSuccess: (data) => {
        this.#submittedProgress = data.progress
        this.emit('progress-submitted', { progress: this.#submittedProgress })
      },
      syncAttempt: (attempt) => {
        this.#progressRetryAttempt = attempt
      },
    })
  }

  async #submitPageStateInner(): Promise<boolean> {
    // Snapshot the value handed to each attempt so a success only marks the
    // state in-sync when the page state hasn't changed again mid-flight.
    let submitted: any
    return this.#runWithRetry({
      context: 'pagestate',
      verb: 'submit',
      shouldRun: () => !this.#pageStateInSync,
      call: (client) => {
        submitted = this.#pageState
        return client.putPageState(submitted)
      },
      onSuccess: () => {
        if (this.#pageState === submitted) {
          this.#pageStateInSync = true
        }
        this.emit('pagestate-submitted')
      },
      syncAttempt: (attempt) => {
        this.#pageStateRetryAttempt = attempt
      },
    })
  }

  async #fetchProgress(): Promise<boolean> {
    let done = false
    return this.#runWithRetry({
      context: 'progress',
      verb: 'fetch',
      shouldRun: () => !done,
      call: (client) => client.getProgress(),
      onSuccess: (data) => {
        const progress = data.progress
        this.#progress = progress
        this.#submittedProgress = progress
        this.emit('progress-changed', { progress })
        this.emit('progress-submitted', { progress })
        done = true
      },
    })
  }

  async #fetchPageState(): Promise<boolean> {
    let done = false
    return this.#runWithRetry({
      context: 'pagestate',
      verb: 'fetch',
      shouldRun: () => !done,
      call: (client) => client.getPageState(),
      onSuccess: (data) => {
        const pageState = data.page_state
        this.#pageState = pageState
        this.#pageStateInSync = true
        this.emit('pagestate-changed', { pageState })
        done = true
      },
    })
  }

  // Shared retry/backoff state machine for the agent's authenticated requests.
  // Repeatedly runs `call` while `shouldRun()` holds, invoking `onSuccess` on
  // each successful response.  A `session-expired` result transitions the agent
  // to the expired state (emitting `session-expired` once); a failing request is
  // retried up to four times with exponential backoff, after which the
  // connection is marked lost.  Returns true when the operation completes
  // without giving up, false when it bails (session expired, connection lost, or
  // the session was already gone).
  async #runWithRetry<T>(opts: {
    context: 'progress' | 'pagestate'
    verb: 'submit' | 'fetch'
    shouldRun: () => boolean
    call: (client: ApiClient) => Promise<ApiRequestResult<T>>
    onSuccess: (data: T) => void
    syncAttempt?: (attempt: number) => void
  }): Promise<boolean> {
    const { context, verb, shouldRun, call, onSuccess, syncAttempt } = opts
    const noun = context === 'progress' ? 'progress' : 'page state'
    const gerund = verb === 'submit' ? 'submitting' : 'fetching'

    let attempt = 0
    syncAttempt?.(0)

    while (shouldRun()) {
      if (this.#auth.status !== 'authenticated') {
        // The session ended while we were waiting to retry.  The session-expired
        // event has already been emitted, so there is nothing more to do here.
        return false
      }

      const result = await call(this.#auth.client)

      if (result.status === 'ok') {
        onSuccess(result.data)
        attempt = 0
        syncAttempt?.(0)

        if (this.#auth.status === 'authenticated' && this.#auth.connectionLost) {
          this.#auth.connectionLost = false
          this.emit('connection-restored')
        }

        continue
      }

      if (result.status === 'session-expired') {
        // Only transition (and emit) once.
        if (this.#auth.status === 'authenticated') {
          const error: AgentError = {
            type: 'session-expired',
            context,
            message: 'Session expired or invalid',
            retriable: false,
          }

          this.#lastError = error
          this.#auth = {
            status: 'expired',
            baseUrl: result.baseUrl,
          }
          this.emit('error', error)
          this.emit('session-expired')
        }

        return false
      }

      if (result.status === 'client-error') {
        // A non-401 4xx is terminal: the request is malformed, forbidden, or
        // targets something that doesn't exist, so retrying won't help.  Report
        // the error but leave the session authenticated and the connection
        // intact -- this is a request-level rejection, not a connectivity loss.
        const error: AgentError = {
          type: 'request-rejected',
          context,
          message: `Request rejected while ${gerund} ${noun} (HTTP ${result.code})`,
          retriable: false,
        }

        this.#lastError = error
        this.emit('error', error)

        return false
      }

      if (attempt >= 4) {
        const error: AgentError =
          result.status === 'server-error'
            ? {
                type: 'server-error',
                context,
                message: `Server error while ${gerund} ${noun}`,
                retriable: true,
              }
            : {
                type: 'network-error',
                context,
                message: `Network error while ${gerund} ${noun}: ${result.error}`,
                retriable: true,
              }

        this.#lastError = error
        this.emit('error', error)

        if (this.#auth.status === 'authenticated' && this.#auth.connectionLost === false) {
          this.#auth.connectionLost = true
          this.emit('connection-lost')
        }

        return false
      }

      const delay = 1000 * 2 ** attempt
      attempt += 1
      syncAttempt?.(attempt)

      this.emit('retry', {
        type: context,
        attempt,
        nextRetryMs: delay,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    return true
  }

  async #initialize() {
    await this.#logger?.log('Beginning agent initialization')

    const result = await this.#authenticate(this.#logger)

    if (result.status === 'authenticated') {
      await this.#logger?.log(
        `Authentication succeeded.  Connected to ${JSON.stringify(result.baseUrl, null, 2)}`
      )

      this.#auth = {
        status: 'authenticated',
        user: result.user,
        client: this.#createClient(result.baseUrl, result.token),
        connectionLost: false,
      }
    } else if (result.status === 'expired') {
      await this.#logger?.log('Modulus session has ended -- re-launch required')

      this.#lastError = {
        type: 'session-expired',
        context: 'auth',
        message: 'Session has ended',
        retriable: false,
      }

      this.#auth = {
        status: 'expired',
      }

      this.emit('error', this.#lastError)
    } else if (result.status === 'failed') {
      await this.#logger?.log('Modulus agent failed to authenticate')

      this.#lastError = {
        type: 'init-failed',
        context: 'auth',
        message: 'Authentication failed',
        retriable: false,
      }

      this.#auth = {
        status: 'failed',
        error: result.error,
      }

      this.emit('error', this.#lastError)
    } else {
      await this.#logger?.log('Modulus agent not connected -- operating locally only')

      this.#auth = {
        status: 'none',
      }
    }

    await this.#loadInitialState()

    await this.#logger?.log('Finished agent initialization')

    this.#ready = true
    this.emit('ready', { auth: this.authStatus() })
  }

  async #loadInitialState() {
    if (this.#auth.status !== 'authenticated') {
      return
    }

    await this.#logger?.log('Loading initial progress and page state')

    const results = await Promise.all([this.#fetchProgress(), this.#fetchPageState()])
    if (results.some((val) => val === false)) {
      await this.#logger?.log('Failed to load initial progress / page state')

      // TODO: For now, treat errors here as an authentication failure.
      // Technically this isn't correct -- we already authenticated
      // successfully, so we really should keep #auth.status = 'authenticated'
      // and separately signal that the initial state failed to load.  The
      // question is: what should the page do in that case?  If it goes
      // interactive, and the user interacts and generates new page state, we
      // then have to figure out how to merge that page with the state from the
      // server (once we eventually load it).

      this.#lastError = {
        type: 'init-failed',
        message: 'Failed to load initial state',
        context: 'initialization',
        retriable: false,
      }

      this.#auth = {
        status: 'failed',
        error: this.#lastError.message,
      }

      this.emit('error', this.#lastError)
    }
  }
}

// Create a Modulus agent, wiring in the real authentication flow and API client.
// This is the public way to construct an agent; the implementation class is not
// exported from the package.
export function createModulusAgent(logger?: Logger): ModulusAgentImpl {
  return new ModulusAgentImpl({
    logger,
    authenticate,
    createClient: (baseUrl, token) => new ApiClient(baseUrl, token),
  })
}

// The public agent type: the instance surface returned by `createModulusAgent`.
// Being the instance type (rather than the class), it exposes the agent's
// methods but not its constructor, so the injectable dependencies never appear
// in the public API.
export type ModulusAgent = ReturnType<typeof createModulusAgent>
