import './main.css'

import logoSvg from './assets/modulus-logo-symbol-white.svg'
import type { ModulusAgent } from '@/core/agent.js'

export type ModulusWidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ModulusWidgetOptions {
  position?: ModulusWidgetPosition
  offset?: number
}

export interface ModulusWidgetHandle {
  destroy: () => void
}

type WidgetStatus =
  | 'initializing'
  | 'disconnected'
  | 'connected'
  | 'connection-lost'
  | 'session-expired'
  | 'error'

const statusLabels: Record<WidgetStatus, string> = {
  initializing: 'Connecting to Modulus…',
  disconnected: 'Not connected to Modulus',
  connected: 'Connected to Modulus',
  'connection-lost': 'Connection lost — retrying',
  'session-expired': 'Session expired',
  error: 'Modulus error',
}

function getWidgetStatus(agent: ModulusAgent): WidgetStatus {
  if (!agent.isReady()) return 'initializing'
  const auth = agent.authStatus()
  if (auth.status === 'none') return 'disconnected'
  if (auth.status === 'failed') return 'error'
  if (auth.status === 'expired') return 'session-expired'
  if (agent.isConnectionLost()) return 'connection-lost'
  return 'connected'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const setupModulusAvatar = (
  agent: ModulusAgent,
  options: ModulusWidgetOptions = {}
): ModulusWidgetHandle => {
  const position = options.position ?? 'bottom-left'
  const offset = options.offset ?? 20

  const container = document.createElement('div')
  container.id = 'modulus-agent-ui-container'
  container.classList.add(`modulus-pos-${position}`)
  container.style.setProperty('--modulus-offset', `${offset}px`)
  document.body.appendChild(container)

  const button = document.createElement('button')
  button.type = 'button'
  button.title = 'Modulus'
  button.classList.add('modulus-avatar')

  const img = document.createElement('img')
  img.src = logoSvg
  img.alt = ''
  button.appendChild(img)

  const statusDot = document.createElement('span')
  statusDot.classList.add('modulus-status-dot')
  button.appendChild(statusDot)

  const panel = document.createElement('div')
  panel.classList.add('modulus-panel')
  panel.setAttribute('aria-hidden', 'true')
  panel.setAttribute('role', 'dialog')

  container.appendChild(button)
  container.appendChild(panel)

  let open = false

  const renderButton = () => {
    const status = getWidgetStatus(agent)
    button.className = 'modulus-avatar'
    button.classList.add(`modulus-status-${status}`)
    button.setAttribute('aria-label', `Modulus — ${statusLabels[status]}`)
  }

  const renderPanel = () => {
    const status = getWidgetStatus(agent)
    const user = agent.user()
    const progress = agent.progress()
    const submitted = agent.submittedProgress()
    const pct = Math.round(progress * 100)
    const submittedPct = Math.round(submitted * 100)
    const inSync = Math.abs(progress - submitted) < 1e-6

    const parts: string[] = []

    parts.push(`
      <header class="modulus-panel-header">
        <span class="modulus-panel-title">Modulus</span>
        <button type="button" class="modulus-panel-close" aria-label="Close">×</button>
      </header>
    `)

    parts.push(`
      <p class="modulus-status-line modulus-status-${status}">
        <span class="modulus-status-dot"></span>
        ${statusLabels[status]}
      </p>
    `)

    if (user) {
      parts.push(`<p class="modulus-user">${escapeHtml(user.full_name)}</p>`)
    }

    if (status === 'connected' || status === 'connection-lost') {
      parts.push(`
        <div class="modulus-progress">
          <div class="modulus-progress-label">
            <span>Progress</span>
            <span>${pct}%</span>
          </div>
          <div class="modulus-progress-track">
            <div class="modulus-progress-local" style="width: ${pct}%"></div>
            <div class="modulus-progress-submitted" style="width: ${submittedPct}%"></div>
          </div>
          <p class="modulus-sync-line">
            ${inSync ? 'Synced with Modulus' : 'Saving to Modulus…'}
          </p>
        </div>
      `)
    }

    if (status === 'connection-lost') {
      parts.push(`<button type="button" class="modulus-retry">Retry now</button>`)
    }

    panel.innerHTML = parts.join('')

    panel.querySelector('.modulus-panel-close')?.addEventListener('click', () => setOpen(false))
    panel.querySelector('.modulus-retry')?.addEventListener('click', () => {
      void agent.retry()
    })
  }

  const render = () => {
    renderButton()
    if (open) renderPanel()
  }

  const setOpen = (next: boolean) => {
    open = next
    container.classList.toggle('modulus-open', open)
    panel.setAttribute('aria-hidden', open ? 'false' : 'true')
    if (open) renderPanel()
  }

  button.addEventListener('click', () => setOpen(!open))

  const unsubscribers: Array<() => void> = [
    agent.on('ready', render),
    agent.on('progress-changed', render),
    agent.on('progress-submitted', render),
    agent.on('pagestate-changed', render),
    agent.on('pagestate-submitted', render),
    agent.on('connection-lost', render),
    agent.on('connection-restored', render),
    agent.on('session-expired', render),
    agent.on('error', render),
  ]

  render()

  return {
    destroy: () => {
      for (const off of unsubscribers) off()
      container.remove()
    },
  }
}

export const removeModulusAvatar = () => {
  const container = document.getElementById('modulus-agent-ui-container') as HTMLElement
  container?.remove()
}
