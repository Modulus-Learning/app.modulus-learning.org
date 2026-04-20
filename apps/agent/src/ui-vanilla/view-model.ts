import type { ModulusAgent } from '@/core/agent.js'
import type { AgentError } from '@/core/types.js'

export type ModulusWidgetStatus =
  | 'initializing'
  | 'disconnected'
  | 'connected'
  | 'connection-lost'
  | 'session-expired'
  | 'error'

export type ModulusWidgetSyncState = 'saved' | 'saving' | 'unsaved'

export interface ModulusWidgetViewModel {
  status: ModulusWidgetStatus
  statusLabel: string
  userName: string | undefined
  progress: number
  submittedProgress: number
  progressPercent: number
  submittedPercent: number
  inSync: boolean
  showProgress: boolean
  canRetry: boolean
  syncState: ModulusWidgetSyncState
  syncLabel: string
  lastSavedLabel: string | undefined
  lastError: AgentError | undefined
}

export interface ModulusWidgetViewModelOptions {
  lastSavedAt?: Date
  now?: Date
}

export const statusLabels: Record<ModulusWidgetStatus, string> = {
  initializing: 'Connecting to Modulus…',
  disconnected: 'Not connected to Modulus',
  connected: 'Connected to Modulus',
  'connection-lost': 'Connection lost — retrying',
  'session-expired': 'Session expired',
  error: 'Modulus not connected',
}

export const syncLabels: Record<ModulusWidgetSyncState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved',
}

export function getWidgetStatus(agent: ModulusAgent): ModulusWidgetStatus {
  if (!agent.isReady()) return 'initializing'
  const auth = agent.authStatus()
  if (auth.status === 'none') return 'disconnected'
  if (auth.status === 'failed') return 'error'
  if (auth.status === 'expired') return 'session-expired'
  if (agent.isConnectionLost()) return 'connection-lost'
  return 'connected'
}

export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - from.getTime()
  if (diffMs < 5_000) return 'just now'
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function getWidgetViewModel(
  agent: ModulusAgent,
  options: ModulusWidgetViewModelOptions = {}
): ModulusWidgetViewModel {
  const status = getWidgetStatus(agent)
  const user = agent.user()
  const progress = agent.progress()
  const submittedProgress = agent.submittedProgress()
  const inSync = Math.abs(progress - submittedProgress) < 1e-6
  const showProgress = status === 'connected' || status === 'connection-lost'

  let syncState: ModulusWidgetSyncState
  if (!showProgress) {
    syncState = 'saved'
  } else if (status === 'connection-lost' && !inSync) {
    syncState = 'unsaved'
  } else if (!inSync) {
    syncState = 'saving'
  } else {
    syncState = 'saved'
  }

  const lastSavedLabel =
    showProgress && options.lastSavedAt
      ? formatRelativeTime(options.lastSavedAt, options.now ?? new Date())
      : undefined

  return {
    status,
    statusLabel: statusLabels[status],
    userName: user?.full_name,
    progress,
    submittedProgress,
    progressPercent: Math.round(progress * 100),
    submittedPercent: Math.round(submittedProgress * 100),
    inSync,
    showProgress,
    canRetry: status === 'connection-lost',
    syncState,
    syncLabel: syncLabels[syncState],
    lastSavedLabel,
    lastError: agent.lastError(),
  }
}
