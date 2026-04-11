import { ApiClient } from './api-client.js'
import { authenticate } from './auth.js'
import { EventEmitter } from './event-emitter.js'
import { createConsoleLogger, type Logger } from './logger.js'
import type { AgentError, AuthStatus, ModulusAgentEvents, ReadyEvent, User } from './types.js'

// Agent's (internal) authentication state.
type AuthState =
  | { status: 'none' }
  | { status: 'authenticated'; user: User; client: ApiClient; connectionLost: boolean }
  | { status: 'failed'; baseUrl?: string | undefined; error: string }
  | { status: 'expired'; baseUrl: string }

export class ModulusAgent extends EventEmitter<ModulusAgentEvents> {
  // ********************** TOP-LEVEL STATE **********************

  // Has the Modulus agent finished initializing itself?
  #ready = false

  // The current authentication state.
  #auth: AuthState = { status: 'none' }

  // Last error emitted, if any.
  #lastError: AgentError | undefined = undefined

  // Optional logger.
  #logger?: Logger

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

  constructor(logger?: Logger) {
    super()
    this.#logger = logger ?? createConsoleLogger()
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

  async #submitProgressInner() {
    this.#progressRetryAttempt = 0

    while (this.#progress > this.#submittedProgress) {
      if (this.#auth.status !== 'authenticated') {
        // The session expired while waiting to retry submission.  The
        // session-expired event will have already been emitted, so it should be
        // safe to just return.
        return
      }

      const result = await this.#auth.client.putProgress(this.#progress)

      if (result.status === 'ok') {
        this.#submittedProgress = result.data.progress
        this.emit('progress-submitted', { progress: this.#submittedProgress })
        this.#progressRetryAttempt = 0

        if (this.isConnectionLost()) {
          this.#auth.connectionLost = false
          this.emit('connection-restored')
        }

        // Check if we need to submit progress again
        continue
      }

      if (result.status === 'session-expired') {
        // Only emit session-expired once
        if (this.#auth.status === 'authenticated') {
          const error: AgentError = {
            type: 'session-expired',
            context: 'progress',
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

        // We're no longer unauthenticated -- stop trying to submit progress
        return
      }

      if (this.#progressRetryAttempt >= 4) {
        const error: AgentError =
          result.status === 'server-error'
            ? {
                type: 'server-error',
                context: 'progress',
                message: 'Server error while submitting progress',
                retriable: true,
              }
            : {
                type: 'network-error',
                context: 'progress',
                message: `Network error while submitting progress: ${result.error}`,
                retriable: true,
              }

        this.#lastError = error
        this.emit('error', error)

        if (this.isConnectionLost() === false) {
          this.#auth.connectionLost = true
          this.emit('connection-lost')
        }

        // We've exhausted our retries -- the connection is now 'lost', so stop
        // trying to submit progress
        return
      }

      const delay = 1000 * 2 ** this.#progressRetryAttempt
      this.#progressRetryAttempt += 1

      this.emit('retry', {
        type: 'progress',
        attempt: this.#progressRetryAttempt,
        nextRetryMs: delay,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  async #submitPageStateInner() {
    this.#pageStateRetryAttempt = 0

    while (!this.#pageStateInSync) {
      if (this.#auth.status !== 'authenticated') {
        // The session expired while waiting to retry submission.  The
        // session-expired event will have already been emitted, so it should be
        // safe to just return.
        return
      }

      const pageStateToSubmit = this.#pageState
      const result = await this.#auth.client.putPageState(pageStateToSubmit)

      if (result.status === 'ok') {
        // The page state could have been updated while the submission (of
        // pageStateToSubmit) was in progress -- if so, we shouldn't set
        // pageStateInSync to true.
        if (this.#pageState === pageStateToSubmit) {
          this.#pageStateInSync = true
        }
        this.emit('pagestate-submitted')
        this.#pageStateRetryAttempt = 0

        if (this.isConnectionLost()) {
          this.#auth.connectionLost = false
          this.emit('connection-restored')
        }

        // Check if we need to submit page state again
        continue
      }

      if (result.status === 'session-expired') {
        // Only emit session-expired once
        if (this.#auth.status === 'authenticated') {
          const error: AgentError = {
            type: 'session-expired',
            context: 'pagestate',
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

        // We're no longer unauthenticated -- stop trying to submit page state
        return
      }

      if (this.#pageStateRetryAttempt >= 4) {
        const error: AgentError =
          result.status === 'server-error'
            ? {
                type: 'server-error',
                context: 'pagestate',
                message: 'Server error while submitting page state',
                retriable: true,
              }
            : {
                type: 'network-error',
                context: 'pagestate',
                message: `Network error while submitting page state: ${result.error}`,
                retriable: true,
              }

        this.#lastError = error
        this.emit('error', error)

        if (this.isConnectionLost() === false) {
          this.#auth.connectionLost = true
          this.emit('connection-lost')
        }

        // We've exhausted our retries -- the connection is now 'lost', so stop
        // trying to submit progress
        return
      }

      const delay = 1000 * 2 ** this.#pageStateRetryAttempt
      this.#pageStateRetryAttempt += 1

      this.emit('retry', {
        type: 'pagestate',
        attempt: this.#pageStateRetryAttempt,
        nextRetryMs: delay,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  async #fetchProgress(): Promise<boolean> {
    let attempt = 0

    while (true) {
      if (this.#auth.status !== 'authenticated') {
        return false
      }

      const result = await this.#auth.client.getProgress()

      if (result.status === 'ok') {
        const progress = result.data.progress
        this.#progress = progress
        this.#submittedProgress = progress
        this.emit('progress-changed', { progress })
        this.emit('progress-submitted', { progress })

        if (this.isConnectionLost()) {
          this.#auth.connectionLost = false
          this.emit('connection-restored')
        }

        return true
      }

      if (result.status === 'session-expired') {
        // Only emit session-expired once
        if (this.#auth.status === 'authenticated') {
          const error: AgentError = {
            type: 'session-expired',
            context: 'progress',
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

      if (attempt >= 4) {
        const error: AgentError =
          result.status === 'server-error'
            ? {
                type: 'server-error',
                context: 'progress',
                message: 'Server error while fetching progress',
                retriable: true,
              }
            : {
                type: 'network-error',
                context: 'progress',
                message: `Network error while fetching progress: ${result.error}`,
                retriable: true,
              }

        this.#lastError = error
        this.emit('error', error)

        if (this.isConnectionLost() === false) {
          this.#auth.connectionLost = true
          this.emit('connection-lost')
        }

        return false
      }

      const delay = 1000 * 2 ** attempt
      attempt += 1

      this.emit('retry', {
        type: 'progress',
        attempt,
        nextRetryMs: delay,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  async #fetchPageState(): Promise<boolean> {
    let attempt = 0

    while (true) {
      if (this.#auth.status !== 'authenticated') {
        return false
      }

      const result = await this.#auth.client.getPageState()

      if (result.status === 'ok') {
        const pageState = result.data.page_state
        this.#pageState = pageState
        this.#pageStateInSync = true
        this.emit('pagestate-changed', { pageState })

        if (this.isConnectionLost()) {
          this.#auth.connectionLost = false
          this.emit('connection-restored')
        }

        return true
      }

      if (result.status === 'session-expired') {
        // Only emit session-expired once
        if (this.#auth.status === 'authenticated') {
          const error: AgentError = {
            type: 'session-expired',
            context: 'pagestate',
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

        // We're no longer unauthenticated -- stop trying to fetch page state
        return false
      }

      if (attempt >= 4) {
        const error: AgentError =
          result.status === 'server-error'
            ? {
                type: 'server-error',
                context: 'pagestate',
                message: 'Server error while fetching page state',
                retriable: true,
              }
            : {
                type: 'network-error',
                context: 'pagestate',
                message: `Network error while fetching page state: ${result.error}`,
                retriable: true,
              }

        this.#lastError = error
        this.emit('error', error)

        if (this.isConnectionLost() === false) {
          this.#auth.connectionLost = true
          this.emit('connection-lost')
        }

        return false
      }

      const delay = 1000 * 2 ** attempt
      attempt += 1

      this.emit('retry', {
        type: 'pagestate',
        attempt,
        nextRetryMs: delay,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  async #initialize() {
    await this.#logger?.log('Beginning agent initialization')

    const result = await authenticate(this.#logger)

    if (result.status === 'authenticated') {
      await this.#logger?.log(
        `Authentication succeeded.  Connected to ${JSON.stringify(result.baseUrl, null, 2)}`
      )

      this.#auth = {
        status: 'authenticated',
        user: result.user,
        client: new ApiClient(result.baseUrl, result.token),
        connectionLost: false,
      }
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
