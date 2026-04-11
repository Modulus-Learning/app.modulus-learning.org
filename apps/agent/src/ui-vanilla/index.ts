import './main.css'

import logoSvg from './assets/modulus-logo-symbol-white.svg'
import type { ModulusAgent } from '@/core/agent.js'

export const setupModulusAvatar = (agent: ModulusAgent) => {
  const container = document.createElement('div')
  container.id = 'modulus-agent-ui-container'
  document.body.appendChild(container)

  const button = document.createElement('button')
  button.title = 'Modulus'

  const img = document.createElement('img')
  img.src = logoSvg

  let popup: HTMLDivElement | null = null

  button.addEventListener('click', () => {
    if (popup === null) {
      popup = document.createElement('div')
      popup.classList.add('popup')
      popup.textContent = 'Modulus Agent Active'
      container.appendChild(popup)
    } else {
      popup.remove()
      popup = null
    }
  })

  agent.on('ready', () => {
    if (agent.status().lastError != null) {
      button.className = 'error'
    } else if (agent.isConnectionLost()) {
      button.className = 'warn'
    } else if (agent.isAuthenticated()) {
      button.className = 'ok'
    }
  })

  button.appendChild(img)
  container.appendChild(button)

  return button
}

export const removeModulusAvatar = () => {
  const container = document.getElementById('modulus-agent-ui-container') as HTMLElement
  container?.remove()
}
