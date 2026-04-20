import logoSvg from './assets/modulus-logo-symbol-white.svg'
import { widgetStyles } from './styles.js'
import { getWidgetViewModel, type ModulusWidgetViewModel } from './view-model.js'
import type { ModulusAgent } from '@/core/agent.js'

export {
  formatRelativeTime,
  getWidgetStatus,
  getWidgetViewModel,
  type ModulusWidgetStatus,
  type ModulusWidgetSyncState,
  type ModulusWidgetViewModel,
  statusLabels,
  syncLabels,
} from './view-model.js'

export type ModulusWidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ModulusWidgetOptions {
  position?: ModulusWidgetPosition
  offset?: number
}

export interface ModulusWidgetHandle {
  destroy: () => void
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

  const host = document.createElement('div')
  host.id = 'modulus-agent-ui-container'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = widgetStyles
  shadow.appendChild(style)

  const root = document.createElement('div')
  root.classList.add('root', `modulus-pos-${position}`)
  root.style.setProperty('--modulus-offset', `${offset}px`)
  shadow.appendChild(root)

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

  root.appendChild(button)
  root.appendChild(panel)

  let open = false
  let agentReady = agent.isReady()
  let lastSavedAt: Date | undefined
  let timeRefreshTimer: ReturnType<typeof setInterval> | undefined

  const renderButton = (vm: ModulusWidgetViewModel) => {
    button.className = 'modulus-avatar'
    button.classList.add(`modulus-status-${vm.status}`)
    button.setAttribute('aria-label', `Modulus — ${vm.statusLabel}`)
  }

  const renderPanel = (vm: ModulusWidgetViewModel) => {
    const parts: string[] = []

    parts.push(`
      <header class="modulus-panel-header">
        <span class="modulus-panel-title">Modulus</span>
        <button type="button" class="modulus-panel-close" aria-label="Close">×</button>
      </header>
    `)

    parts.push(`
      <p class="modulus-status-line modulus-status-${vm.status}">
        <span class="modulus-status-dot"></span>
        ${vm.statusLabel}
      </p>
    `)

    if (vm.userName) {
      parts.push(`<p class="modulus-user">${escapeHtml(vm.userName)}</p>`)
    }

    if (vm.showProgress) {
      parts.push(`
        <div class="modulus-progress">
          <div class="modulus-progress-label">
            <span>Progress</span>
            <span>${vm.progressPercent}%</span>
          </div>
          <div class="modulus-progress-track">
            <div class="modulus-progress-local" style="width: ${vm.progressPercent}%"></div>
            <div class="modulus-progress-submitted" style="width: ${vm.submittedPercent}%"></div>
          </div>
          <div class="modulus-sync-row">
            <span class="modulus-sync-pill modulus-sync-${vm.syncState}">${vm.syncLabel}</span>
            ${vm.lastSavedLabel ? `<span class="modulus-saved-time">${escapeHtml(vm.lastSavedLabel)}</span>` : ''}
          </div>
        </div>
      `)
    }

    if (vm.canRetry) {
      parts.push(`<button type="button" class="modulus-retry">Retry now</button>`)
    }

    panel.innerHTML = parts.join('')

    panel.querySelector('.modulus-panel-close')?.addEventListener('click', () => setOpen(false))
    panel.querySelector('.modulus-retry')?.addEventListener('click', () => {
      void agent.retry()
    })
  }

  const render = () => {
    const vm = getWidgetViewModel(agent, { lastSavedAt })
    renderButton(vm)
    if (open) renderPanel(vm)
  }

  const startTimeRefresh = () => {
    if (timeRefreshTimer !== undefined) return
    timeRefreshTimer = setInterval(() => {
      if (open && lastSavedAt) render()
    }, 10_000)
  }

  const stopTimeRefresh = () => {
    if (timeRefreshTimer === undefined) return
    clearInterval(timeRefreshTimer)
    timeRefreshTimer = undefined
  }

  const setOpen = (next: boolean) => {
    open = next
    root.classList.toggle('modulus-open', open)
    panel.setAttribute('aria-hidden', open ? 'false' : 'true')
    if (open) {
      renderPanel(getWidgetViewModel(agent, { lastSavedAt }))
      startTimeRefresh()
    } else {
      stopTimeRefresh()
    }
  }

  const handleSubmitted = () => {
    if (agentReady) lastSavedAt = new Date()
    render()
  }

  button.addEventListener('click', () => setOpen(!open))

  const unsubscribers: Array<() => void> = [
    agent.on('ready', () => {
      agentReady = true
      render()
    }),
    agent.on('progress-changed', render),
    agent.on('progress-submitted', handleSubmitted),
    agent.on('pagestate-changed', render),
    agent.on('pagestate-submitted', handleSubmitted),
    agent.on('connection-lost', render),
    agent.on('connection-restored', render),
    agent.on('session-expired', render),
    agent.on('error', render),
  ]

  render()

  return {
    destroy: () => {
      stopTimeRefresh()
      for (const off of unsubscribers) off()
      host.remove()
    },
  }
}

export const removeModulusAvatar = () => {
  const container = document.getElementById('modulus-agent-ui-container') as HTMLElement
  container?.remove()
}
