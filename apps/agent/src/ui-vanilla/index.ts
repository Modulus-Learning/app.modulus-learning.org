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

  const overlay = document.createElement('div')
  overlay.classList.add('modulus-overlay')
  overlay.setAttribute('aria-hidden', 'true')

  root.appendChild(button)
  root.appendChild(panel)
  root.appendChild(overlay)

  let open = false
  // Whether a "Try again" (reload) attempt is currently in flight, and whether
  // the most recent one failed -- both drive the overlay's button feedback.
  let retrying = false
  let retryFailed = false
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

  // ---- Blocking recovery dialog (shown when the initial state fails to load) ----
  // The agent holds all syncing in this state, so the student must not keep
  // working unsaved.  The dialog is built once and updated in place (rebuilding
  // its DOM would drop keyboard focus and reset screen-reader context), traps
  // focus while open, and makes the rest of the page inert.
  let overlayActive = false
  let overlayBuilt = false
  let lastFocused: HTMLElement | null = null
  const inerted: HTMLElement[] = []
  let dialogEl!: HTMLElement
  let retryButton!: HTMLButtonElement
  let reloadButton!: HTMLButtonElement
  let freshButton!: HTMLButtonElement
  let statusEl!: HTMLElement

  const trapFocus = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusables = [retryButton, reloadButton, freshButton]
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const current = shadow.activeElement
    if (e.shiftKey && (current === first || current === dialogEl)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const buildOverlay = () => {
    overlay.innerHTML = `
      <div class="modulus-overlay-dialog" role="alertdialog" aria-modal="true"
           aria-labelledby="modulus-overlay-title" aria-describedby="modulus-overlay-body"
           tabindex="-1">
        <p class="modulus-overlay-title" id="modulus-overlay-title">We couldn't load your saved work</p>
        <p class="modulus-overlay-body" id="modulus-overlay-body">
          Your work for this activity isn't being saved, and your progress won't be
          recorded until the agent reconnects.
        </p>
        <p class="modulus-overlay-status" role="status"></p>
        <div class="modulus-overlay-actions">
          <button type="button" class="modulus-overlay-btn modulus-recovery-retry">Try again</button>
          <button type="button" class="modulus-overlay-btn modulus-recovery-reload">Reload page</button>
        </div>
        <button type="button" class="modulus-overlay-danger modulus-recovery-fresh">
          Start fresh — may overwrite previously saved work
        </button>
      </div>
    `
    dialogEl = overlay.querySelector('.modulus-overlay-dialog') as HTMLElement
    retryButton = overlay.querySelector('.modulus-recovery-retry') as HTMLButtonElement
    reloadButton = overlay.querySelector('.modulus-recovery-reload') as HTMLButtonElement
    freshButton = overlay.querySelector('.modulus-recovery-fresh') as HTMLButtonElement
    statusEl = overlay.querySelector('.modulus-overlay-status') as HTMLElement

    retryButton.addEventListener('click', () => void attemptReload())
    reloadButton.addEventListener('click', () => window.location.reload())
    freshButton.addEventListener('click', () => {
      if (retrying) return
      agent.startFreshFromLocalState()
    })
    overlay.addEventListener('keydown', trapFocus)

    overlayBuilt = true
  }

  const updateOverlayState = () => {
    retryButton.setAttribute('aria-busy', retrying ? 'true' : 'false')
    retryButton.setAttribute('aria-disabled', retrying ? 'true' : 'false')
    retryButton.innerHTML = retrying
      ? `<span class="modulus-spinner" aria-hidden="true"></span> Trying…`
      : 'Try again'
    freshButton.setAttribute('aria-disabled', retrying ? 'true' : 'false')

    statusEl.textContent = retrying
      ? 'Reconnecting…'
      : retryFailed
        ? "Still couldn't reach the server. Try again, or reload the page."
        : ''
    statusEl.classList.toggle('modulus-overlay-status-error', !retrying && retryFailed)
  }

  // Make everything except the widget inert while the dialog is open, so keyboard
  // and screen-reader users can't reach the blocked page behind it.
  const setBackgroundInert = (on: boolean) => {
    if (on) {
      for (const child of Array.from(document.body.children)) {
        if (child === host || !(child instanceof HTMLElement) || child.inert) continue
        child.inert = true
        inerted.push(child)
      }
    } else {
      for (const el of inerted) el.inert = false
      inerted.length = 0
    }
  }

  const renderOverlay = (vm: ModulusWidgetViewModel) => {
    const active = vm.status === 'load-failed'

    if (active && !overlayBuilt) buildOverlay()

    overlay.classList.toggle('modulus-overlay-open', active)
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true')

    if (active) {
      updateOverlayState()
      if (!overlayActive) {
        // Opening: inert the rest of the page, remember where focus was, and move
        // focus into the dialog so its name and description are announced.
        lastFocused = (document.activeElement as HTMLElement | null) ?? null
        setBackgroundInert(true)
        dialogEl.focus()
      }
    } else if (overlayActive) {
      // Closing: restore the page and return focus to where it started.
      retryFailed = false
      setBackgroundInert(false)
      if (lastFocused?.isConnected) lastFocused.focus()
      lastFocused = null
    }

    overlayActive = active
  }

  const render = () => {
    const vm = getWidgetViewModel(agent, { lastSavedAt })
    renderButton(vm)
    renderOverlay(vm)
    if (open) renderPanel(vm)
  }

  // Drive a "Try again" attempt, giving the button in-flight feedback: disable
  // it and show a spinner while the reload runs, then either the overlay clears
  // (success) or a note explains it failed again.  Reusable for other async
  // recovery actions (e.g. the connection-lost retry) since it just awaits the
  // agent's returned promise.
  const attemptReload = async () => {
    if (retrying) return
    retrying = true
    retryFailed = false
    render()
    try {
      await agent.reloadInitialState()
    } finally {
      retrying = false
      retryFailed = !agent.isInitialStateLoaded()
      render()
    }
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
    agent.on('initial-state-changed', render),
    agent.on('error', render),
  ]

  render()

  return {
    destroy: () => {
      stopTimeRefresh()
      setBackgroundInert(false)
      for (const off of unsubscribers) off()
      host.remove()
    },
  }
}

export const removeModulusAvatar = (): void => {
  const container = document.getElementById('modulus-agent-ui-container') as HTMLElement
  container?.remove()
}
