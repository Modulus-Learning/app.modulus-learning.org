import type { ModulusAgent } from '@/core/agent.js'
import type { AgentError } from '@/core/types.js'

export type ModulusWidgetStatus =
  | 'initializing'
  | 'disconnected'
  | 'connected'
  | 'connection-lost'
  | 'session-expired'
  | 'error'

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
  lastError: AgentError | undefined
}

export const statusLabels: Record<ModulusWidgetStatus, string> = {
  initializing: 'Connecting to Modulus…',
  disconnected: 'Not connected to Modulus',
  connected: 'Connected to Modulus',
  'connection-lost': 'Connection lost — retrying',
  'session-expired': 'Session expired',
  error: 'Modulus error',
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

export function getWidgetViewModel(agent: ModulusAgent): ModulusWidgetViewModel {
  const status = getWidgetStatus(agent)
  const user = agent.user()
  const progress = agent.progress()
  const submittedProgress = agent.submittedProgress()
  const showProgress = status === 'connected' || status === 'connection-lost'

  return {
    status,
    statusLabel: statusLabels[status],
    userName: user?.full_name,
    progress,
    submittedProgress,
    progressPercent: Math.round(progress * 100),
    submittedPercent: Math.round(submittedProgress * 100),
    inSync: Math.abs(progress - submittedProgress) < 1e-6,
    showProgress,
    canRetry: status === 'connection-lost',
    lastError: agent.lastError(),
  }
}
