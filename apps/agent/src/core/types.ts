// *********************************************

export type User = { id: string; full_name: string }

export type AuthStatus =
  | { status: 'authenticated'; user: User }
  | { status: 'failed'; error: string }
  | { status: 'none' }
  | { status: 'expired' }

// *************** Error types *****************

export type AgentError = {
  type:
    | 'init-failed'
    | 'network-error'
    | 'server-error'
    | 'session-expired'
    | 'submission-failed'
    | 'invalid-call'
  context: 'progress' | 'pagestate' | 'initialization' | 'auth'
  message: string
  error?: unknown
  retriable: boolean
}

// *************** Event types *****************

export type ReadyEvent = {
  auth: AuthStatus
}

export type ProgressEvent = {
  progress: number
}

export type PageStateEvent = {
  pageState: any
}

export type RetryEvent = {
  type: 'progress' | 'pagestate'
  attempt: number
  nextRetryMs: number
}

export type ModulusAgentEvents = {
  // The agent has finished initializing and is ready for use.
  ready: [event: ReadyEvent]

  // Progress has changed locally.
  'progress-changed': [event: ProgressEvent]

  // Progress has been successfully submitted to the Modulus API.
  'progress-submitted': [event: ProgressEvent]

  // Page state has changed locally.
  'pagestate-changed': [event: PageStateEvent]

  // Page state has been successfully submitted to the Modulus API.
  'pagestate-submitted': []

  // An error has occurred during progress or page state submission.
  error: [event: AgentError]

  // A retry attempt is being made for progress or page state submission.
  retry: [event: RetryEvent]

  // Connection to the Modulus API has been lost.
  'connection-lost': []

  // Connection to the Modulus API has been restored.
  'connection-restored': []

  // The user's session has expired.
  'session-expired': []
}
